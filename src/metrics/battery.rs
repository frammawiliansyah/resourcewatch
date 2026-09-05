use serde::Serialize;
use starship_battery::units::ratio::percent;
use starship_battery::units::time::second;
use starship_battery::Manager;

#[derive(Debug, Clone, Serialize)]
pub struct BatteryInfo {
    pub available: bool,
    pub pct: Option<f32>,
    pub status: Option<String>,
    pub time_to_empty_secs: Option<u64>,
}

impl BatteryInfo {
    fn unavailable() -> Self {
        Self {
            available: false,
            pct: None,
            status: None,
            time_to_empty_secs: None,
        }
    }
}

/// Wraps the battery manager. Desktops/servers with no battery simply yield
/// an empty iterator (no panic), so `available` becomes `false` there.
pub struct BatteryMonitor {
    manager: Option<Manager>,
}

impl BatteryMonitor {
    pub fn new() -> Self {
        match Manager::new() {
            Ok(manager) => Self {
                manager: Some(manager),
            },
            Err(e) => {
                tracing::warn!("battery manager init failed ({e}), battery monitoring disabled");
                Self { manager: None }
            }
        }
    }

    pub fn collect(&self) -> BatteryInfo {
        let Some(manager) = &self.manager else {
            return BatteryInfo::unavailable();
        };
        let Ok(mut batteries) = manager.batteries() else {
            return BatteryInfo::unavailable();
        };
        let Some(Ok(battery)) = batteries.next() else {
            return BatteryInfo::unavailable();
        };

        BatteryInfo {
            available: true,
            pct: Some(battery.state_of_charge().get::<percent>()),
            status: Some(format!("{:?}", battery.state())),
            time_to_empty_secs: battery.time_to_empty().map(|t| t.get::<second>() as u64),
        }
    }
}
