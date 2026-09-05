import { BatteryCard } from './components/cards/BatteryCard'
import { CpuCard } from './components/cards/CpuCard'
import { DiskIoCard } from './components/cards/DiskIoCard'
import { GpuCard } from './components/cards/GpuCard'
import { NetworkCard } from './components/cards/NetworkCard'
import { RamCard } from './components/cards/RamCard'
import { StorageCard } from './components/cards/StorageCard'
import { TemperatureCard } from './components/cards/TemperatureCard'
import { Header } from './components/Header'
import { HistoryPanel } from './components/HistoryPanel'
import { ProcessesTable } from './components/ProcessesTable'
import { useSnapshotSocket } from './hooks/useSnapshotSocket'

export default function App() {
  const { snapshot, history, connected } = useSnapshotSocket()

  return (
    <div className="min-h-full">
      <Header connected={connected} lastTs={snapshot?.ts ?? null} />

      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
        {!snapshot ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
            Connecting to ResourceWatch...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <CpuCard snapshot={snapshot} history={history} />
              <RamCard snapshot={snapshot} history={history} />
              <GpuCard snapshot={snapshot} history={history} />
              <StorageCard snapshot={snapshot} />
              <NetworkCard snapshot={snapshot} history={history} />
              <DiskIoCard snapshot={snapshot} history={history} />
              <TemperatureCard snapshot={snapshot} history={history} />
              <BatteryCard snapshot={snapshot} history={history} />
            </div>

            <ProcessesTable snapshot={snapshot} />

            <HistoryPanel latest={snapshot} />
          </>
        )}
      </main>
    </div>
  )
}
