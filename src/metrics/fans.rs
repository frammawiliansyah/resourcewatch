//! Fan telemetry read straight from sysfs `hwmon`.
//!
//! Two separate things live here:
//!
//! * [`FanMonitor`]: per-tick RPM readings, part of every [`crate::metrics::Snapshot`].
//! * [`report`]: an on-demand dump that also includes the firmware fan
//!   curve, re-scanned on each call so edits made outside this process (via
//!   `asusctl`, a systemd unit, or a manual sysfs write) show up immediately.
//!
//! Everything degrades to "unavailable" rather than failing: laptops without
//! hwmon fan sensors, desktops, VMs and non-Linux-ish setups all just report
//! `available: false`.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const HWMON_ROOT: &str = "/sys/class/hwmon";
const PLATFORM_PROFILE: &str = "/sys/firmware/acpi/platform_profile";

/// Firmware fan curves expose at most 8 points on the hardware we've seen;
/// the loop stops early anyway once a point is missing.
const MAX_CURVE_POINTS: u8 = 8;

#[derive(Debug, Clone, Serialize)]
pub struct FanReading {
    /// Raw sysfs label (e.g. `cpu_fan`), or `<hwmon name> fanN` when the
    /// kernel driver doesn't provide one.
    pub label: String,
    pub rpm: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct FanInfo {
    pub available: bool,
    pub fans: Vec<FanReading>,
    /// Human-readable control mode, e.g. `custom curve` or `automatic`.
    pub control_mode: Option<String>,
    /// ACPI platform profile (`quiet` / `balanced` / `performance`), which on
    /// most laptops selects which firmware fan curve is active.
    pub platform_profile: Option<String>,
}

impl FanInfo {
    fn unavailable() -> Self {
        Self {
            available: false,
            fans: Vec::new(),
            control_mode: None,
            platform_profile: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CurvePoint {
    pub temp_c: u32,
    /// Raw PWM duty, 0-255.
    pub pwm: u32,
    /// Same value as a percentage, for display.
    pub pct: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct FanCurve {
    pub label: String,
    /// True when this curve is what the firmware is actually following.
    pub enabled: bool,
    pub points: Vec<CurvePoint>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FanReport {
    pub available: bool,
    pub fans: Vec<FanReading>,
    pub control_mode: Option<String>,
    pub platform_profile: Option<String>,
    pub curves: Vec<FanCurve>,
}

fn read_trimmed(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

fn read_u32(path: &Path) -> Option<u32> {
    read_trimmed(path)?.parse().ok()
}

/// Every `hwmon` directory paired with its driver name.
fn hwmon_dirs() -> Vec<(String, PathBuf)> {
    let Ok(entries) = fs::read_dir(HWMON_ROOT) else {
        return Vec::new();
    };
    let mut out: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let name = read_trimmed(&path.join("name"))?;
            Some((name, path))
        })
        .collect();
    // hwmon indices are assigned in probe order and shift between boots, so
    // sort by name to keep output stable regardless of that ordering.
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

/// A resolved `fanN_input` file plus the label to report it under.
struct FanSource {
    label: String,
    input: PathBuf,
}

fn discover_fans(dirs: &[(String, PathBuf)]) -> Vec<FanSource> {
    let mut out = Vec::new();
    for (name, dir) in dirs {
        for idx in 1..=8u8 {
            let input = dir.join(format!("fan{idx}_input"));
            if !input.exists() {
                continue;
            }
            let label = read_trimmed(&dir.join(format!("fan{idx}_label")))
                .unwrap_or_else(|| format!("{name} fan{idx}"));
            out.push(FanSource { label, input });
        }
    }
    out
}

/// Turns a `pwmN_enable` value into something a human can read. The meaning
/// is driver-specific: the ASUS custom-curve driver uses 1 for "the curve
/// below is in force", while the plain fan interface uses 0 for full speed.
fn describe_mode(hwmon_name: &str, value: u32) -> Option<String> {
    if hwmon_name.contains("custom_fan_curve") {
        return match value {
            1 => Some("custom curve".to_string()),
            2 => Some("automatic (firmware curve)".to_string()),
            other => Some(format!("mode {other}")),
        };
    }
    match value {
        0 => Some("full speed".to_string()),
        1 => Some("manual".to_string()),
        2 => Some("automatic".to_string()),
        other => Some(format!("mode {other}")),
    }
}

/// A custom curve that is actually enabled wins over the generic interface,
/// because that's what the fans are really following.
fn control_mode(dirs: &[(String, PathBuf)]) -> Option<String> {
    let mut fallback = None;
    for (name, dir) in dirs {
        let Some(value) = read_u32(&dir.join("pwm1_enable")) else {
            continue;
        };
        let described = describe_mode(name, value);
        if name.contains("custom_fan_curve") && value == 1 {
            return described;
        }
        fallback = fallback.or(described);
    }
    fallback
}

fn read_curve(dir: &Path, pwm_idx: u8) -> Vec<CurvePoint> {
    let mut points = Vec::new();
    for point in 1..=MAX_CURVE_POINTS {
        let temp = read_u32(&dir.join(format!("pwm{pwm_idx}_auto_point{point}_temp")));
        let pwm = read_u32(&dir.join(format!("pwm{pwm_idx}_auto_point{point}_pwm")));
        let (Some(temp_c), Some(pwm)) = (temp, pwm) else {
            break;
        };
        points.push(CurvePoint {
            temp_c,
            pwm,
            pct: (pwm * 100) / 255,
        });
    }
    points
}

/// Curve tables live in their own hwmon node with no fan labels of their own,
/// so `pwmN` is matched positionally against `fanN` from the sensor node.
fn discover_curves(dirs: &[(String, PathBuf)], fans: &[FanSource]) -> Vec<FanCurve> {
    let mut out = Vec::new();
    for (name, dir) in dirs {
        for pwm_idx in 1..=4u8 {
            if !dir
                .join(format!("pwm{pwm_idx}_auto_point1_pwm"))
                .exists()
            {
                continue;
            }
            let points = read_curve(dir, pwm_idx);
            if points.is_empty() {
                continue;
            }
            let enabled = read_u32(&dir.join(format!("pwm{pwm_idx}_enable")))
                .is_some_and(|v| !name.contains("custom_fan_curve") || v == 1);
            let label = fans
                .get(usize::from(pwm_idx) - 1)
                .map(|f| f.label.clone())
                .unwrap_or_else(|| format!("{name} pwm{pwm_idx}"));
            out.push(FanCurve {
                label,
                enabled,
                points,
            });
        }
    }
    out
}

fn platform_profile() -> Option<String> {
    read_trimmed(Path::new(PLATFORM_PROFILE))
}

/// Caches the resolved `fanN_input` paths so each tick is just a handful of
/// small reads instead of a full `/sys/class/hwmon` walk.
pub struct FanMonitor {
    fans: Vec<FanSource>,
}

impl FanMonitor {
    pub fn new() -> Self {
        let dirs = hwmon_dirs();
        let fans = discover_fans(&dirs);
        if fans.is_empty() {
            tracing::warn!("no hwmon fan sensors found, fan monitoring disabled");
        } else {
            let labels: Vec<&str> = fans.iter().map(|f| f.label.as_str()).collect();
            tracing::info!("fan monitoring enabled for: {}", labels.join(", "));
        }
        Self { fans }
    }

    pub fn collect(&self) -> FanInfo {
        if self.fans.is_empty() {
            return FanInfo::unavailable();
        }

        let fans: Vec<FanReading> = self
            .fans
            .iter()
            .filter_map(|f| {
                Some(FanReading {
                    label: f.label.clone(),
                    rpm: read_u32(&f.input)?,
                })
            })
            .collect();

        // Re-read control mode each tick: it's two tiny sysfs reads and it
        // means switching power profile shows up without a restart.
        let dirs = hwmon_dirs();

        FanInfo {
            available: !fans.is_empty(),
            fans,
            control_mode: control_mode(&dirs),
            platform_profile: platform_profile(),
        }
    }
}

/// Full fan report including curve tables. Re-scans sysfs on every call.
pub fn report() -> FanReport {
    let dirs = hwmon_dirs();
    let sources = discover_fans(&dirs);
    let fans: Vec<FanReading> = sources
        .iter()
        .filter_map(|f| {
            Some(FanReading {
                label: f.label.clone(),
                rpm: read_u32(&f.input)?,
            })
        })
        .collect();
    let curves = discover_curves(&dirs, &sources);

    FanReport {
        available: !fans.is_empty() || !curves.is_empty(),
        fans,
        control_mode: control_mode(&dirs),
        platform_profile: platform_profile(),
        curves,
    }
}
