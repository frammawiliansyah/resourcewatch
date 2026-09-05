use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct InterfaceInfo {
    pub name: String,
    pub rx_bytes_per_sec: u64,
    pub tx_bytes_per_sec: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct NetworkInfo {
    pub rx_bytes_per_sec: u64,
    pub tx_bytes_per_sec: u64,
    pub interfaces: Vec<InterfaceInfo>,
}

/// `networks` must already have been refreshed for this tick; `received()`/
/// `transmitted()` report bytes since the previous refresh, so we divide by
/// the actually-elapsed time to get an accurate rate even if the tick loop
/// jitters relative to the configured interval.
pub fn collect(networks: &sysinfo::Networks, elapsed_secs: f64) -> NetworkInfo {
    let elapsed_secs = elapsed_secs.max(0.001);
    let mut total_rx = 0u64;
    let mut total_tx = 0u64;
    let interfaces = networks
        .list()
        .iter()
        .filter(|(name, _)| *name != "lo")
        .map(|(name, data)| {
            let rx = (data.received() as f64 / elapsed_secs) as u64;
            let tx = (data.transmitted() as f64 / elapsed_secs) as u64;
            total_rx += rx;
            total_tx += tx;
            InterfaceInfo {
                name: name.clone(),
                rx_bytes_per_sec: rx,
                tx_bytes_per_sec: tx,
            }
        })
        .collect();
    NetworkInfo {
        rx_bytes_per_sec: total_rx,
        tx_bytes_per_sec: total_tx,
        interfaces,
    }
}
