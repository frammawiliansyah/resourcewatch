use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub bind_addr: String,
    pub port: u16,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            bind_addr: "0.0.0.0".to_string(),
            port: 8090,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct PollingConfig {
    pub poll_interval_ms: u64,
    pub history_interval_secs: u64,
}

impl Default for PollingConfig {
    fn default() -> Self {
        Self {
            poll_interval_ms: 1000,
            history_interval_secs: 10,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct RetentionConfig {
    pub retention_days: u32,
    pub cleanup_interval_secs: u64,
}

impl Default for RetentionConfig {
    fn default() -> Self {
        Self {
            retention_days: 3,
            cleanup_interval_secs: 3600,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DatabaseConfig {
    pub path: String,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            path: "data/history.db".to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct FrontendConfig {
    pub static_dir: String,
}

impl Default for FrontendConfig {
    fn default() -> Self {
        Self {
            static_dir: "frontend/dist".to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct Config {
    pub server: ServerConfig,
    pub polling: PollingConfig,
    pub retention: RetentionConfig,
    pub database: DatabaseConfig,
    pub frontend: FrontendConfig,
}

fn env_val<T: std::str::FromStr>(key: &str) -> Option<T> {
    std::env::var(key).ok().and_then(|s| s.parse().ok())
}

impl Config {
    pub fn load() -> Self {
        let path = std::env::var("RW_CONFIG_PATH").unwrap_or_else(|_| "config.toml".to_string());
        let mut cfg: Config = match std::fs::read_to_string(&path) {
            Ok(raw) => match toml::from_str(&raw) {
                Ok(cfg) => cfg,
                Err(e) => {
                    tracing::warn!("failed to parse {path}: {e}, using defaults");
                    Config::default()
                }
            },
            Err(_) => {
                tracing::warn!("{path} not found, using defaults");
                Config::default()
            }
        };
        cfg.apply_env_overrides();
        cfg
    }

    fn apply_env_overrides(&mut self) {
        if let Some(v) = env_val::<String>("RW_BIND_ADDR") {
            self.server.bind_addr = v;
        }
        if let Some(v) = env_val::<u16>("RW_PORT") {
            self.server.port = v;
        }
        if let Some(v) = env_val::<u64>("RW_POLL_INTERVAL_MS") {
            self.polling.poll_interval_ms = v;
        }
        if let Some(v) = env_val::<u64>("RW_HISTORY_INTERVAL_SECS") {
            self.polling.history_interval_secs = v;
        }
        if let Some(v) = env_val::<u32>("RW_RETENTION_DAYS") {
            self.retention.retention_days = v;
        }
        if let Some(v) = env_val::<u64>("RW_CLEANUP_INTERVAL_SECS") {
            self.retention.cleanup_interval_secs = v;
        }
        if let Some(v) = env_val::<String>("RW_DB_PATH") {
            self.database.path = v;
        }
        if let Some(v) = env_val::<String>("RW_STATIC_DIR") {
            self.frontend.static_dir = v;
        }
    }
}
