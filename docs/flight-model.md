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
CL_att = CLα (α − α0)
CL_fp  = sin 2α                                  flat plate
σ+ = 1 / (1 + exp(−(α − α_c+) / w))              positive stall
σ− = 1 / (1 + exp( (α − α_c−) / w))              negative stall
σ  = σ+ + σ−                                     (they never overlap meaningfully)
CL = (1 − σ) CL_att + σ CL_fp + ΔCL_devices + CLq q̂ + CLδe δe
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
CD = (1 − σ)(CD0 + K CL_att²) + σ (CD0 + 2 sin²α) + ΔCD_wave(M) + ΔCD_devices
```

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
```

`ΔCLmax` moves the positive stall: the loader solves `α_c+` for the device closed and fully open, and
the sim interpolates linearly between them with `δb`. No root-finding happens during flight.

Flaps, gear and speedbrakes use the same form when their airplanes arrive.

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

Thrust, ground contact and water contact join with their milestones and are documented here first.

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

All performance figures are at sea level, standard day, airbrakes closed, wings level, unless the
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

Handling figures (short-period frequency and damping, phugoid, Dutch roll, spiral, roll rate and roll
lag, spins) join this section at M3.

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
| `devices` | `airbrake` {cd, dclmax, cm} (more device types later) |
| `engines` | list; empty for a glider |
| `limits` | `vne_kmh` or `vne_kt`, plus any other limit speeds and load factors |
| `targets` | the numbers tests check, each with its mass, tolerance and source |
| `src` | per group, a map from field to source key (`fm`, `bga`, `fit`, `est`, ...), or one string when the whole group shares a source |

Signs on the card follow section 1. Full right pedal gives positive `rudder.cn_full` (nose right) and
negative `rudder.cy_full` (the fin is pushed left). Adverse aileron yaw gives negative
`aileron.cn_full` (right roll, nose left).
