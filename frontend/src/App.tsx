import { BatteryCard } from './components/cards/BatteryCard'
import { CpuCard } from './components/cards/CpuCard'
import { DiskIoCard } from './components/cards/DiskIoCard'
import { FanCurveCard } from './components/cards/FanCurveCard'
import { GpuCard } from './components/cards/GpuCard'
import { NetworkCard } from './components/cards/NetworkCard'
import { RamCard } from './components/cards/RamCard'
import { StorageCard } from './components/cards/StorageCard'
import { ThermalCard } from './components/cards/ThermalCard'
import { Header } from './components/Header'
import { HistoryPanel } from './components/HistoryPanel'
import { ProcessesTable } from './components/ProcessesTable'
import { Minimize2 } from 'lucide-react'
import { useFullscreen } from './hooks/useFullscreen'
import { useSnapshotSocket } from './hooks/useSnapshotSocket'

export default function App() {
  const { snapshot, history, connected } = useSnapshotSocket()
  const { isFullscreen, toggle, supported } = useFullscreen()

  return (
    <div className="min-h-full">
      {isFullscreen ? (
        <button
          type="button"
          onClick={toggle}
          title="Exit fullscreen (F / Esc)"
          aria-label="Exit fullscreen"
          className="fixed top-3 right-3 z-50 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:opacity-100 focus:opacity-100"
        >
          <Minimize2 size={14} />
        </button>
      ) : (
        <Header
          connected={connected}
          lastTs={snapshot?.ts ?? null}
          onFullscreen={supported ? toggle : undefined}
        />
      )}

      <main
        className={
          isFullscreen
            ? 'flex flex-col gap-4 p-4'
            : 'mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6'
        }
      >
        {!snapshot ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
            Connecting to ResourceWatch...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CpuCard snapshot={snapshot} history={history} />
              <RamCard snapshot={snapshot} history={history} />
              <BatteryCard snapshot={snapshot} history={history} />
              <StorageCard snapshot={snapshot} />
              <NetworkCard snapshot={snapshot} history={history} />
              <DiskIoCard snapshot={snapshot} history={history} />
              <ThermalCard snapshot={snapshot} history={history} />
              <FanCurveCard snapshot={snapshot} />
              <GpuCard snapshot={snapshot} history={history} />
            </div>

            <ProcessesTable snapshot={snapshot} />

            {!isFullscreen && <HistoryPanel latest={snapshot} />}
          </>
        )}
      </main>
    </div>
  )
}
