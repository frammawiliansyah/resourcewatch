/// Picks a representative CPU package/die temperature out of whatever
/// sensors `lm-sensors` exposes on this machine. Falls back to the first
/// available component, then `None` if there are no sensors at all.
pub fn cpu_temp(components: &sysinfo::Components) -> Option<f32> {
    let list = components.list();
    list.iter()
        .find(|c| {
            let label = c.label().to_lowercase();
            label.contains("package") || label.contains("cpu") || label.contains("tctl")
        })
        .or_else(|| list.first())
        .and_then(|c| c.temperature())
}
