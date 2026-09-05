export interface CpuInfo {
  usage_pct: number
  per_core: number[]
  temp_c: number | null
}

export interface RamInfo {
  used_bytes: number
  total_bytes: number
  available_bytes: number
  swap_used_bytes: number
  swap_total_bytes: number
}

export interface GpuInfo {
  available: boolean
  name: string | null
  util_pct: number | null
  mem_used_bytes: number | null
  mem_total_bytes: number | null
  temp_c: number | null
  power_w: number | null
  fan_pct: number | null
}

export interface MountInfo {
  mount_point: string
  used_bytes: number
  total_bytes: number
  pct: number
}

export interface StorageInfo {
  mounts: MountInfo[]
}

export interface InterfaceInfo {
  name: string
  rx_bytes_per_sec: number
  tx_bytes_per_sec: number
}

export interface NetworkInfo {
  rx_bytes_per_sec: number
  tx_bytes_per_sec: number
  interfaces: InterfaceInfo[]
}

export interface DiskIoInfo {
  read_bytes_per_sec: number
  write_bytes_per_sec: number
}

export interface BatteryInfo {
  available: boolean
  pct: number | null
  status: string | null
  time_to_empty_secs: number | null
}

export interface ProcessEntry {
  pid: number
  name: string
  cpu_pct: number
  mem_bytes: number
}

export interface ProcessesInfo {
  top_cpu: ProcessEntry[]
  top_mem: ProcessEntry[]
}

export interface FanReading {
  label: string
  rpm: number
}

export interface FanInfo {
  available: boolean
  fans: FanReading[]
  control_mode: string | null
  platform_profile: string | null
}

export interface CurvePoint {
  temp_c: number
  pwm: number
  pct: number
}

export interface FanCurve {
  label: string
  enabled: boolean
  points: CurvePoint[]
}

export interface FanReport {
  available: boolean
  fans: FanReading[]
  control_mode: string | null
  platform_profile: string | null
  curves: FanCurve[]
}

export interface Snapshot {
  ts: number
  cpu: CpuInfo
  ram: RamInfo
  gpu: GpuInfo
  storage: StorageInfo
  network: NetworkInfo
  disk_io: DiskIoInfo
  battery: BatteryInfo
  processes: ProcessesInfo
  fans: FanInfo
}

export type MetricKey =
  | 'cpu'
  | 'ram'
  | 'gpu'
  | 'network'
  | 'diskio'
  | 'storage'
  | 'temperature'
  | 'battery'

export type RangeKey = '15m' | '1h' | '6h' | '24h' | '3d'

export interface HistoryResponse {
  metric: string
  range: string
  points: Record<string, number | string | boolean | number[] | null>[]
}

export interface RuntimeConfig {
  poll_interval_ms: number
  history_interval_secs: number
  retention_days: number
  bind_addr: string
  port: number
  gpu_available: boolean
}
