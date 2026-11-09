# Flight model

The authority for `src/sim/`. Every force and moment the sim applies is written here first. If code
and this document disagree, the document wins until it is changed on purpose.

The model is one set of equations for every airplane. Only the card's numbers differ.

## 1. Frames, units and signs

- SI units throughout: m, kg, s, N, rad. Speeds in the sim are m/s.
- **World frame:** NED. x north, y east, z down. Gravity is `g_w = (0, 0, 9.80665)` m/s².
- **Body frame:** x forward, y right, z down, origin at the centre of gravity.
- **Attitude:** unit quaternion `q` rotating body vectors into world vectors, `v_w = R(q) v_b`.
- **Rates:** `ω = (p, q, r)` in body axes. p rolls right wing down, q pitches nose up, r yaws nose right.
- **Controls** (pilot sense): `δe, δa, δr ∈ [-1, 1]` and `δb` (airbrake), flaps, throttle `∈ [0, 1]`.
  - `δe = +1`: stick full back, nose-up moment.
  - `δa = +1`: full right roll.
  - `δr = +1`: full right pedal, nose-right moment.

## 2. State

```
x   position, world (m), doubles
v   velocity of the CG relative to the ground, body axes (m/s)
q   attitude quaternion (body to world)
ω   body rates (rad/s)
```

Engine states, gear position and similar slow states join the vector when their milestone arrives.

## 3. Atmosphere (ISA)

For geopotential altitude `h = -x_w.z` (m):

```
0 ≤ h ≤ 11 000:   T = 288.15 − 0.0065 h
                  p = 101 325 (T / 288.15)^5.255 88
11 000 < h ≤ 20 000:
                  T = 216.65
                  p = 22 632.1 exp(−g (h − 11 000) / (R T))
ρ = p / (R T),   a = √(γ R T),   R = 287.053,   γ = 1.4
```

Below sea level, extend the troposphere formula. Above 20 km, hold the 20 km values.

## 4. Air-relative velocity

```
w_w        wind at the airplane's position and time, world axes (m/s); zero except in air features
V_b = v − R(q)ᵀ w_w                 air-relative velocity, body axes (u, v, w)
V   = |V_b|
α   = atan2(w, u)                    angle of attack
β   = asin(v / V)                    sideslip
q̄   = ½ ρ V²                          dynamic pressure
M   = V / a                          Mach number
p̂ = p b / (2V),  q̂ = q c̄ / (2V),  r̂ = r b / (2V)      non-dimensional rates
```

When `V < 1 m/s`, aerodynamic forces and moments are zero (the airplane is parked or falling
straight down with no meaningful airflow; ground contact handles the rest).

## 5. Derived quantities (computed once when a card loads)

```
AR   = b² / S                                 aspect ratio
c̄    = S / b                                  mean chord (simple; good enough for these cards)
CLα  = 2π AR / (2 + √(AR² + 4))               lift-curve slope per rad (Helmbold)
K    = 1 / (π AR e)                           induced drag factor
Cmα  = −CLα · SM                              pitch stiffness from static margin SM (fraction of c̄)
Cm0  = SM · CL_trim0                          so that Cm = 0 at CL_trim0 with zero elevator and zero rate
I    = diag(m kx², m ky², m kz²)              inertia from radii of gyration (Ixz = 0 for now)
α_c+, α_c−                                    stall blend centres, solved so the blended CL curve's
                                              first peak is exactly CLmax (and CLmin) (section 6.1)
```

## 6. Coefficients

### 6.1 Lift, with the stall

Attached lift is linear. Past the stall it blends to flat-plate lift. The blend weights are logistic
functions of α:

```
CL_att = CLα (α − α0) + ΔCL0                    ΔCL0 from the flaps (section 6.4)
CL_fp  = sin 2α                                  flat plate
σ+ = 1 / (1 + exp(−(α − α_c+) / w))              positive stall
σ− = 1 / (1 + exp( (α − α_c−) / w))              negative stall
σ  = σ+ + σ−                                     (they never overlap meaningfully)
CL = (1 − σ) CL_att + σ CL_fp + CLq q̂ + CLδe δe
```

- `w` is the card's stall softness (`stall_softness_deg`, in radians here). Small `w` is a sharp break,
  large `w` a gentle one.
- The logistic weights are never exactly zero. Several `w` below the stall, σ+ is still a few percent,
  which bends the attached lift curve and adds flat-plate drag in normal flight. A large `w` costs
  glide performance and moves minimum sink to a higher speed (`docs/aircraft.md`, Twin II Acro).
  It also limits how small `CLmax` and `|CLmin|` can be: the attached peak only exists once the centre
  is far enough from α0, so a soft stall cannot have a shallow first peak. The loader stops with an
  error when no centre gives the card's value.
- `α_c+` is not on the card. The loader solves for it (bisection) so that the **first peak** of the
  blended curve above α0 equals `CLmax` exactly. `α_c−` likewise for `CLmin`, searching downward.
  This keeps the card in pilot terms: you set CLmax, which sets stall speed.
- "First peak" matters. Flat-plate lift reaches CL = 1.0 at α = 45°, which is higher than a reduced
  CLmax (the Twin II's is 0.93 with airbrakes open). The global maximum would find that deep-stall
  hump instead of the stall. Walk up from α0 in small steps and stop at the first decrease.
- `CLq` and `CLδe` are small. Start them at zero unless a target needs them.

### 6.2 Drag

```
CD = (1 − σ)(CD0 + φ_ge K CL_att²) + σ (CD0 + 2 sin²α) + ΔCD_wave(M) + ΔCD_devices
```

**Ground effect.** Near the ground the wing's downwash is blocked and its induced drag falls. `φ_ge`
is McCormick's factor (B. W. McCormick, *Aerodynamics, Aeronautics and Flight Mechanics*):

```
φ_ge = (16 h/b)² / (1 + (16 h/b)²)          h: the CG's height above the ground under it
```

It is 0.72 at a tenth of the span, 0.91 at a fifth and 0.98 at half a span, and 1 with no ground
(headless flight, the trim and the performance figures). The CG stands in for the wing: on every card
so far the wing is within a metre of it. Nothing else changes: lift, the stall and the moments are as
in free air. An airplane floats in the flare because it keeps its energy longer, not because a force
holds it up.

Wave drag (zero for subsonic cards):

```
ΔCD_wave = CDw_peak · smoothstep((M − M_dd) / (1 − M_dd))     for M > M_dd, capped at M = 1
```

Supersonic behaviour joins this section when the jets do.

### 6.3 Side force, roll, pitch, yaw

```
CY = CYβ β + CYδr δr
Cl = Clβ β + Clp_eff p̂ + Clr r̂ + Clδa δa + Clδr δr
Cm = Cm0 + Cmα (α − α0) + Cmq q̂ + Cmδe δe + ΔCm_devices
Cn = Cnβ β + Cnp p̂ + Cnr r̂ + Cnδr δr + Cnδa δa
```

- `Clr = clr_per_cl · CL` and `Cnp = cnp_per_cl · CL`. A yawing wing rolls toward the slow side, and a
  rolling wing yaws against the roll, both in proportion to lift. This matters most for gliders.
- **Roll damping in the stall:** `Clp_eff = Clp · (1 − (1 + A) σ)` where `A` is the card's
  `autorotation`. At full stall, roll damping becomes `−A·Clp`, which feeds a roll instead of
  resisting it. Spins and snap rolls come from this, not from a script. `A = 0` disables it.
- Control powers on the card are the coefficient at full deflection (`δ = 1`), so `Clδa` is
  `aileron.cl_full`, and so on. Pitch-up and pitch-down elevator powers may differ
  (`elevator.cm_full_up`, `elevator.cm_full_down`); use the one matching the sign of `δe`.

### 6.4 Devices

Each device adds its own increments, scaled by its position `0..1`:

```
airbrake:  ΔCD = cd · δb,   ΔCLmax = dclmax · δb,   ΔCm = cm · δb
flaps:     ΔCL0 = cl0 · δf,  ΔCD = cd · δf,   ΔCLmax = dclmax · δf,   ΔCm = cm · δf
```

`ΔCL0` is lift added at every angle of attack on the attached side: flaps move the zero-lift angle
down to `α0 − ΔCL0 / CLα`, so `CL_att = CLα (α − α0) + ΔCL0` and the induced drag includes it.
`ΔCLmax` moves the positive stall: the loader solves `α_c+` for each device fully out, alone, and the
sim adds the shifts, each in proportion to its position:

```
α_c+ = α_c+,0 + δb (α_c+,b − α_c+,0) + δf (α_c+,f − α_c+,0)
```

No root-finding happens during flight. The flaps' position `δf` is what the sim takes; how fast they
run between up and down (the card's `travel_s`) is the controls' job (`docs/controls.md`), and the
speed they may be lowered at is a limit on the card (`limits.flaps_max_*`). Gear and speedbrakes use
the same form when their airplanes arrive.

## 7. Forces and moments

Directions in body axes, from the air-relative velocity:

```
V̂  = V_b / V
ŷ  = (0, 1, 0)
L̂  = normalize(ŷ × V̂)          lift direction: perpendicular to the airflow and the wing's span
D̂  = −V̂                         drag direction

F_aero = q̄ S (CL L̂ + CD D̂ + CY ŷ)
M_aero = q̄ S (b Cl, c̄ Cm, b Cn)
F_grav = m R(q)ᵀ g_w
```

Check: with β = 0, `L̂ = (sin α, 0, −cos α)`, which points up and slightly forward. Correct.

Thrust is section 7.1, ground contact section 11. Water contact joins with its milestone and is
documented here first.

### 7.1 Thrust: piston engine and propeller

Each engine on the card is a piston engine turning a propeller. Its thrust acts along the engine's
`axis` (body axes, a unit vector: `(1, 0, 0)` points straight ahead) at its `pos_m` (the propeller hub,
body axes from the CG), so a thrust line above or below the CG pitches the airplane. The throttle `τ`
runs from 0 (idle) to 1 (full).

**Power** falls with air density (Gagg and Ferrar's rule for an unsupercharged engine):

```
σ = ρ / ρ0
P = P_rated · τ · max(0, 1.132 σ − 0.132)
```

Idle is zero power. A real idling propeller makes a little thrust or a little drag depending on speed;
both are left out.

**Thrust** comes from momentum theory for the propeller's disc, area `A = π D² / 4`. The airflow
through the disc is accelerated from `V` (the airspeed along the axis, never below 0) to `v_s` far
behind, and the power that does it is the shaft power times the propeller's profile efficiency `η`:

```
η P = T (V + v_s) / 2          v_s = √(V² + 2T / (ρ A))
```

`T` is solved from this each step (it rises with `P` and falls with `V`, so one root). It holds both
limits: standing still it gives the static thrust `T_static = (2 ρ A (η P)²)^(1/3)`, and fast it tends
to `T = η P / V`, with the momentum loss included. No separate blend is needed.

`η` is a propeller's efficiency apart from that momentum loss, at its best near its design speed `V_d`
(the card's `design_kmh` or `design_mph`). A fixed-pitch propeller loses efficiency away from it; a
constant-speed propeller much less. One card field, `falloff`, says how much:

```
η(V) = η_max · max(0, 1 − falloff · ((V − V_d) / V_d)²)
```

So the static efficiency is `η_max (1 − falloff)`. Typical: `falloff` 0.3 for a fixed-pitch climb or
cruise propeller, 0.05 for a constant-speed one.

**Torque reaction.** The engine turns the propeller with torque `Q = P / Ω`, `Ω` the propeller's rated
speed (`rpm`). The airframe feels `−Q` about the engine axis. The card's `rotation` says which way the
propeller turns seen from the cockpit: `cw` (s = +1) or `ccw` (s = −1). A clockwise propeller's
reaction rolls the airplane left.

```
M_torque = −s Q · axis
```

**P-factor.** At an angle of attack the descending blade meets the air at a higher angle than the
rising one and pulls harder, so the thrust's centre moves off the hub. With `R = D / 2` and the card's
`p_factor` `k`:

```
M_pfactor = s k T R (0, −β, −α)
```

A clockwise propeller at positive α yaws the nose left; in a sideslip from the right it pitches the
nose down. Small for a Cub, strong for a Pitts.

**Slipstream.** The slipstream speed `v_s` is above. The fraction of the tail in it, the card's
`slipstream_tail` `f`, sees the dynamic pressure `q̄ + f T / A` instead of `q̄`. Only the controls on
the tail feel the extra: the elevator and the rudder work on the ground at full power and weaken at
idle.

```
q_extra = f T / A
ΔM = q_extra S (b Clδr δr, c̄ Cmδe(δe), b Cnδr δr)        ΔF_y = q_extra S CYδr δr
```

This acts even below 1 m/s of airspeed (section 4), where the rest of the aerodynamics is zero. The
tail's own stability and damping, the slipstream over the wing, and the propeller's gyroscopic
precession are left out for now.

The total for each engine, in body axes: `F = T · axis`, `M = pos × F + M_torque + M_pfactor + ΔM`,
and `ΔF_y` added to the force.

## 8. Equations of motion

```
m (v̇ + ω × v) = F_aero + F_thrust + F_contact + F_grav
I ω̇ + ω × (I ω) = M_aero + M_thrust + M_contact
q̇ = ½ q ⊗ (0, ω)
ẋ = R(q) v
```

Integrated with classical RK4 at a fixed step of 1/120 s. Renormalize `q` after every step. The step
is deterministic: the same card, initial state, inputs and seed produce the same flight, bit for bit.

## 9. Trim and the performance figures

All performance figures are at sea level, standard day, airbrakes closed, flaps up, wings level, unless the
target says otherwise. At sea level, indicated, equivalent and true airspeed are the same, so the
flight manual's indicated speeds can be compared directly.

- **Steady glide at speed V:** solve for α, δe and flight-path angle γ such that, with ω = 0,
  `Cm = 0`, `L = W cos γ` and `D = W sin γ`. Glide ratio is `L/D`, sink rate is `V sin γ`.
- **Stall speed:** `Vs = √(2W / (ρ S CL_peak))` where `CL_peak` is the first peak of the blended
  lift curve (section 6.1), with full nose-up elevator available. If full elevator can't reach `CL_peak`, the stall speed is
  set by the elevator instead, and the test reports that.
- **Best glide:** the maximum of glide ratio over V, and the V where it occurs.
- **Minimum sink:** the minimum of sink rate over V, and the V where it occurs. The sink curve is very
  flat near its minimum, so its speed is a loose check and the sink rate a tight one.
- **Dynamic check:** start the 6-DOF sim in a trimmed glide and fly it for 60 s with the elevator held
  at its trim value (as if trimmed with the trim lever) and everything else neutral. It must stay
  within 2 km/h and 0.5° of the trimmed state. This proves the trim and the integrator agree.

- **Steady flight with power at speed V and throttle τ:** solve for α, δe and the flight-path angle
  γ (positive climbing) such that, with ω = 0 and wings level, the sim's own total force (section 7,
  thrust section 7.1, gravity) is zero along and across the flight path and its pitching moment is
  zero. The rate of climb is `V sin γ`. At τ = 0 this is the glide above, with γ = −γ_glide.
- **Rate of climb at a speed:** steady flight at full throttle at that speed. **Best rate of climb:**
  its maximum over V, and the V where it occurs.
- **Maximum level speed:** the highest V where steady flight at full throttle has γ = 0. **Cruise
  speed at a power:** the same at the throttle that gives that fraction of rated power.
- **Turns:** in a level turn at load factor `n` and speed V, the turn rate is `g √(n² − 1) / V`. The
  load factor available at V is the lift limit, `½ ρ V² S CL_peak / W`, or the card's `g_max`,
  whichever is less. The **maximum instantaneous turn rate** is the highest turn rate over V from the
  stall to VNE; it is at the **corner speed** `Vs √g_max`, where the two limits meet, or at VNE when
  the corner is above it. The **maximum sustained turn rate** is
  the highest turn rate at which thrust equals drag: at each V, the largest load factor `n` (up to
  the lift and load limits) at which steady flight at full throttle with the weight taken as `n W`
  still has γ ≥ 0. The turn's own pitch and yaw rates are left out. An airplane without an engine has
  none.
- **Energy-manoeuvrability diagram:** turn rate against speed, from the stall to VNE: the lift limit,
  the load limit (`g_max`), the sustained turn curve (with an engine) and VNE.

Handling figures are section 12; spins are section 13.

## 10. The card

Each card is `data/aircraft/<id>.json`. Groups and fields:

| Group | Fields |
| --- | --- |
| identity | `id`, `name`, `maker`, `model`, `category`, `sources` (key → document) |
| `mass` | `mass_kg`, `g_max`, `g_min`, `radii_of_gyration_m` {roll, pitch, yaw} |
| `wing` | `area_m2`, `span_m`, `sweep_deg`, `taper`, `alpha0_deg`, `cl_max`, `cl_min`, `stall_softness_deg`, `oswald_e` |
| `drag` | `cd0`, `mach_dd`, `cdw_peak` |
| `stability` | `static_margin`, `cl_trim0`, `cmq`, `cy_beta`, `cl_beta`, `clp`, `clr_per_cl`, `cn_beta`, `cnp_per_cl`, `cnr`, `autorotation` |
| `control` | `elevator` {cm_full_up, cm_full_down}, `aileron` {cl_full, cn_full}, `rudder` {cn_full, cy_full, cl_full} |
| `devices` | `airbrake` {cd, dclmax, cm}, `flaps` {cl0, cd, dclmax, cm, travel_s} (section 6.4); either may be left out |
| `engines` | list; empty for a glider. Each: `type` (`piston`), `power_hp` (or `power_kw`), `rpm`, `pos_m`, `axis`, `rotation` (`cw` or `ccw` from the cockpit), `p_factor`, `slipstream_tail`, and `prop` {`diameter_in` or `diameter_m`, `eta_max`, `design_mph` or `design_kmh`, `falloff`} (section 7.1) |
| `cg` | `from_nose_m`, `above_nose_m`: the CG's place on the airframe, from the model's origin at the nose tip |
| `glb` | `file` (the model, `assets/models/<id>.glb`), `origin` (where the model's origin is on the airframe), `liveries` (each `name` and `texture`, the skin generated beside the model; the first is the one inside the `.glb`) |
| `contacts` | list of contact points (section 11), each `name`, `type` (`wheel` or `skid`), `pos_m` (body axes from the CG), `k` (N/m), `c` (N·s/m), and for a wheel `brake` (true when it has one) and `steer_deg` (how far it steers with full rudder, section 11.4; 0 when it doesn't) |
| `wheel_brake` | `when`: what puts the wheel brakes on (section 11.4): `airbrake_full` (a glider) or `throttle_idle` |
| `crash` | `wheel_sink_ms`, `skid_speed_ms`: the touchdown limits of section 11.6 |
| `speeds` | `approach_kmh`, `cruise_kmh`: the trimmed speeds the handling figures are measured at (section 12) |
| `limits` | `vne_kmh` or `vne_kt`, plus any other limit speeds and load factors |
| `targets` | the numbers tests check, each with its mass, tolerance and source |
| `src` | per group, a map from field to source key (`fm`, `bga`, `fit`, `est`, ...), or one string when the whole group shares a source |

Signs on the card follow section 1. Full right pedal gives positive `rudder.cn_full` (nose right) and
negative `rudder.cy_full` (the fin is pushed left). Adverse aileron yaw gives negative
`aileron.cn_full` (right roll, nose left).

`wing.sweep_deg` is the sweep of the quarter-chord line and `wing.taper` the tip chord over the root
chord; with the area and span they give the planform (root chord `2S / (b (1 + taper))`).

## 11. Ground contact

The ground pushes on the airplane only through its contact points. Every contact force is a normal
force and a friction force at a point, so it makes a moment about the CG: a wingtip dropped at walking
pace swings the glider around, a braked wheel below the CG pitches the nose down. Nothing else holds
the airplane up, steers it or stops it.

### 11.1 The ground

The world supplies two functions of position: `heightAt(x, y)`, the ground's height above sea level
(m), and `surfaceAt(x, y)`, a surface name. The ground's outward normal `n` points up. For flat ground,
`n = (0, 0, −1)` in world axes; sloping terrain joins at M6, with its own normal.

Each surface has friction coefficients, all dimensionless, in `data/surfaces.json`:

| Field | Meaning |
| --- | --- |
| `mu_roll` | rolling resistance of a free wheel |
| `mu_side` | the most sideways grip a wheel's tyre has |
| `mu_brake` | added along a wheel when its brake is on |
| `mu_skid` | sliding friction of a skid (a wingtip, the nose, a tail skid) |

### 11.2 Contact points

The card lists contact points (section 10), each fixed in body axes at `r_b` from the CG. A `wheel`
point is the bottom of the tyre with the gear at rest. A `skid` is any other part that can touch:
wingtips, the nose. Tyre radius, wheel inertia and gear geometry are not modelled. The spring is the
tyre and the gear together.

For each point:

```
r_w = x + R(q) r_b                       position, world
v_p = R(q) (v + ω × r_b)                 velocity of the point over the ground, world
d   = heightAt(r_w.x, r_w.y) + r_w.z     penetration below the ground (positive inside it)
ḋ   = −(v_p · n)                         penetration rate (positive moving in)
```

### 11.3 Normal force

```
N = max(0, k d + c ḋ)    when d > 0, otherwise 0
```

`k` (N/m) and `c` (N·s/m) are the point's stiffness and damping from the card. The force never pulls:
a point leaving the ground lets go.

### 11.4 Friction

The sliding velocity is the point's velocity along the ground, `v_t = v_p − (v_p · n) n`. Friction
uses one smooth law: proportional to the slip below a small slip speed `v_slip`, and the full `μ N`
above it. An airplane then comes to a clean stop instead of jittering about zero.

```
sat(u) = max(−1, min(1, u))
v_slip = 0.1 m/s
```

**Wheels.** The wheel rolls along `e_r`, its own heading laid flat on the ground:
`e_r = normalize(x̂_w − (x̂_w · n) n)` with `x̂_w = R(q) (cos ψ, sin ψ, 0)`. Across it is `e_s = n × e_r`.
`ψ` is the wheel's steering angle about the body z axis, positive toward the right: 0 for a fixed
wheel, and `ψ = δr · steer` for a wheel that steers with the rudder (the contact's `steer_deg`). The
linkage decides the sign: a nose wheel turns with the pedal (`steer_deg` positive), a tailwheel
against it (`steer_deg` negative), because the tail has to swing left for the nose to go right.

```
F_roll = −(μ_roll + b μ_brake) N sat((v_t · e_r) / v_slip) e_r
F_side = −μ_side N sat((v_t · e_s) / v_slip) e_s
```

`b` is the brake's share, from 0 to 1, for a wheel that has a brake, and 0 for one that hasn't. The
card's `wheel_brake.when` says when the brakes are on: `airbrake_full` (the airbrake lever at the end
of its travel, as on many two-seat gliders) or `throttle_idle` (the throttle closed, as on a powered
airplane). With the brakes on, the rudder makes them differential, like toe brakes: for a wheel on the
side `s_w` (+1 right of the centreline, −1 left, 0 on it)

```
b = clamp(1 + s_w δr, 0, 1)
```

so full right pedal brakes only the right wheel, and a wheel on the centreline always brakes fully.
A brake only acts through a wheel's friction, so it does nothing in the air.

**Skids.** A skid slides against its velocity:

```
F_skid = −μ_skid N v_t / max(|v_t|, v_slip)
```

### 11.5 Force and moment on the airplane

```
F_w = N n + F_friction                   at each touching point, world
F_contact = Σ R(q)ᵀ F_w                  body axes
M_contact = Σ r_b × R(q)ᵀ F_w
```

They enter the equations of motion (section 8) beside the aerodynamic forces and are evaluated in
every RK4 stage like them.

**Step size.** Contact is the stiffest part of the model. With `m_e` the mass a point feels (the mass,
or the inertia about the CG over the arm squared, whichever is smaller), three rates must stay well
under RK4's limit at 1/120 s, about 330 per second: the spring `√(k / m_e)`, the damper `c / m_e`, and
the friction `μ N / (v_slip m_e)` at the loads of a firm landing. The Twin II Acro's worst case is a
wingtip's damper, about 110 per second.

### 11.6 Crash

A crash is an event, not a force. After each step, a point that was not touching (d ≤ 0) and now is
(d > 0) has touched down. Its speeds are the ones it arrived with, taken from the state at the start
of that step, the last one before contact: by the end of the step the contact's damping has already
slowed it, by up to a tenth for a firm arrival. The flight ends when:

- a wheel touches down with `ḋ` over the card's `crash.wheel_sink_ms`, or
- a skid touches down with `|v_t|` over the card's `crash.skid_speed_ms`.

A wingtip settling at the end of a landing roll touches down slowly and is not a crash. After a
crash the sim no longer steps.

## 12. Handling

How an airplane answers its controls and recovers from a disturbance. Every figure is measured from
the 6-DOF sim itself, with the same forces and equations as flight, never from a separate formula.
`node tools/fly.js <id> --handling` prints them; `src/sim/handling.js` measures them.

### 12.1 The modes

At each of the card's `speeds` (approach and cruise), sea level, airbrakes closed:

1. **Trim** a steady, wings-level glide (section 9), or for an airplane with an engine, steady level
   flight with the throttle that holds it (section 9, steady flight with power, solved for τ at γ = 0).
2. **Linearize.** Take the eight states that govern the motion, `u, v, w` (body velocity), `p, q, r`
   and the bank and pitch angles `φ, θ`, and find how each one's rate of change responds to a small
   change in each, by central differences of the sim's own derivatives (sections 7, 8). Trimmed wings
   level, the longitudinal states (`u, w, q, θ`) and the lateral ones (`v, p, r, φ`) don't affect
   each other, so they form two 4×4 matrices.
3. **Find their eigenvalues** (the characteristic polynomial's roots). Each mode is an eigenvalue or a
   complex pair:

| Mode | Which eigenvalues | Figures |
| --- | --- | --- |
| short period | the faster longitudinal pair | natural frequency ω (rad/s), damping ratio ζ |
| phugoid | the slower longitudinal pair | period 2π/ω_d (s), damping ratio ζ |
| Dutch roll | the lateral complex pair | ω (rad/s), ζ, and ζω |
| roll mode | the faster lateral real root λ | time constant τ = −1/λ (s) |
| spiral | the slower lateral real root λ | time to double ln 2/λ when λ > 0, to half ln 2/(−λ) when λ < 0 |

For a pair `λ = σ ± iω_d`, `ω = |λ|` and `ζ = −σ / ω`. A pair of real roots counts as an overdamped
mode with `ω = √(λ₁λ₂)` and `ζ = −(λ₁ + λ₂) / (2ω)`. When all four lateral roots are real, the
Dutch roll is overdamped: it is the middle two, between the roll mode (the fastest) and the spiral
(the slowest).

The linearization is checked against the full sim: a small speed step from trim, flown for a few
minutes, must show the phugoid's period and damping (`tests/handling.test.js`).

### 12.2 Roll performance

Flown in the 6-DOF sim at each speed, sea level, from the same trim as the modes, throttle held,
rudder neutral and no assists:

- **Bank-to-bank time:** from a steady 45° turn one way, full aileron the other way; the time to reach
  45° the other way.
- **Maximum roll rate:** from wings level, full aileron; the largest roll rate `p` reached.

### 12.3 Bounds

Every airplane must meet these sanity bounds at both speeds. They are MIL-F-8785C Level 1 values,
checked against a secondary source (the MathWorks "Flying Quality Analysis for 6DOF De Havilland
Beaver Airframe" example, which quotes the specification's Flight Phase Category B requirements); the
specification itself (AFWAL-TR-81-3109 and the MIL-F-8785C text on DTIC) could not be read.

| Figure | Bound | Note |
| --- | --- | --- |
| short-period damping ratio | 0.35 to 1.30 | Category B allows 0.30 to 2.0; 0.35 to 1.30 is the narrower range the M3 brief recalled, kept as the stricter bound |
| phugoid damping ratio | at least 0.04 | |
| Dutch roll | ζ at least 0.08, ω at least 0.4 rad/s, ζω at least 0.15 rad/s | the ζω limit was missing from the M3 brief; it is in the specification |
| roll-mode time constant | at most 1.4 s | |
| spiral | stable, or time to double at least 20 s | |

A light, efficient glider sits near two of these by nature: its phugoid damping is roughly
1/(√2 · L/D), about 0.02 at L/D 37 before pitch damping helps, and many gliders are mildly spirally
unstable at low speed. The card's pitch damping, dihedral effect and yaw damping are set so they pass,
within what their geometry supports (`docs/aircraft.md`).

