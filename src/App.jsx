import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearVehicles,
  deleteVehicle,
  getVehicles,
  saveVehicle,
} from './db'
import {
  blobToDataUrl,
  calculate,
  compressImage,
  dataUrlToBlob,
  downloadBlob,
  escapeCsv,
  formatDateKey,
  formatDuration,
  formatFullDate,
  formatTime,
  getDateKey,
  money,
  nowDateTimeLocal,
  shiftDate,
  today,
  toDateTimeLocal,
} from './utils'

const SETTINGS_KEY = 'parking-settings'

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY))

    return {
      rate: Number(saved?.rate) || 2,
      billingMode: saved?.billingMode || 'started',
    }
  } catch {
    return {
      rate: 2,
      billingMode: 'started',
    }
  }
}

function VehiclePhoto({
  photo,
  className = '',
  onClick,
}) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!photo) {
      setUrl('')
      return
    }

    if (typeof photo === 'string') {
      setUrl(photo)
      return
    }

    const objectUrl = URL.createObjectURL(photo)

    setUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [photo])

  if (!url) return null

  return (
    <img
      src={url}
      alt="Veículo"
      onClick={() => onClick?.(url)}
      className={className}
    />
  )
}

export default function App() {
  const [vehicles, setVehicles] = useState([])
  const [tab, setTab] = useState('dashboard')

  const [settings, setSettings] = useState(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [plate, setPlate] = useState('')
  const [model, setModel] = useState('')
  const [color, setColor] = useState('')
  const [photo, setPhoto] = useState(null)

  const [vehicleDate, setVehicleDate] = useState(today())
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [reportStart, setReportStart] = useState(today())
  const [reportEnd, setReportEnd] = useState(today())

  const [editingVehicle, setEditingVehicle] = useState(null)
  const [editEntry, setEditEntry] = useState('')
  const [editExit, setEditExit] = useState('')

  const [exitVehicle, setExitVehicle] = useState(null)
  const [exitDateTime, setExitDateTime] = useState('')

  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraTarget, setCameraTarget] = useState('new')

  const [previewPhoto, setPreviewPhoto] = useState('')
  const [copied, setCopied] = useState(false)
  const [deletedVehicle, setDeletedVehicle] = useState(null)

  const [now, setNow] = useState(Date.now())

  const videoRef = useRef(null)
  const undoTimerRef = useRef(null)

  async function loadVehicles() {
    const data = await getVehicles()

    data.sort(
      (a, b) =>
        new Date(b.entry).getTime() -
        new Date(a.entry).getTime(),
    )

    setVehicles(data)
  }

  useEffect(() => {
    loadVehicles()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(settings),
    )
  }, [settings])

  useEffect(() => {
    if (
      cameraOpen &&
      cameraStream &&
      videoRef.current
    ) {
      videoRef.current.srcObject = cameraStream

      videoRef.current.play().catch(() => {})
    }
  }, [cameraOpen, cameraStream])

  function closeCamera() {
    cameraStream?.getTracks().forEach(track => {
      track.stop()
    })

    setCameraStream(null)
    setCameraOpen(false)
  }

  async function openCamera(target = 'new') {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('A câmera não está disponível neste navegador.')
      return
    }

    let stream

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            exact: 'environment',
          },
        },
        audio: false,
      })
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: 'environment',
            },
          },
          audio: false,
        })
      } catch {
        alert('Não foi possível acessar a câmera traseira.')
        return
      }
    }

    setCameraTarget(target)
    setCameraStream(stream)
    setCameraOpen(true)
  }

  async function takePhoto() {
    const video = videoRef.current

    if (!video?.videoWidth) return

    const canvas = document.createElement('canvas')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    canvas
      .getContext('2d')
      .drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height,
      )

    canvas.toBlob(
      async blob => {
        if (!blob) return

        const compressed = await compressImage(blob)

        if (cameraTarget === 'edit') {
          setEditingVehicle(current => ({
            ...current,
            photo: compressed,
          }))
        } else {
          setPhoto(compressed)
        }

        closeCamera()
      },
      'image/jpeg',
      0.9,
    )
  }

  async function selectPhoto(file, target = 'new') {
    if (!file) return

    const compressed = await compressImage(file)

    if (target === 'edit') {
      setEditingVehicle(current => ({
        ...current,
        photo: compressed,
      }))
    } else {
      setPhoto(compressed)
    }
  }

  async function registerEntry() {
    if (!plate.trim()) {
      alert('Informe a placa.')
      return
    }

    const vehicle = {
      id: crypto.randomUUID(),
      plate: plate.trim().toUpperCase(),
      model: model.trim().toUpperCase(),
      color: color.trim().toUpperCase(),
      photo,
      entry: new Date().toISOString(),
      exit: null,
    }

    await saveVehicle(vehicle)

    setPlate('')
    setModel('')
    setColor('')
    setPhoto(null)

    setVehicleDate(today())

    await loadVehicles()

    setTab('vehicles')
  }

  function requestExit(vehicle) {
    setExitVehicle(vehicle)
    setExitDateTime(nowDateTimeLocal())
  }

  async function confirmExit() {
    if (!exitVehicle || !exitDateTime) return

    const exit = new Date(exitDateTime)

    if (exit < new Date(exitVehicle.entry)) {
      alert('A saída não pode ser anterior à entrada.')
      return
    }

    await saveVehicle({
      ...exitVehicle,
      exit: exit.toISOString(),
    })

    setExitVehicle(null)
    setExitDateTime('')

    await loadVehicles()
  }

  async function reopenVehicle(vehicle) {
    if (!window.confirm('Remover a saída deste veículo?')) {
      return
    }

    await saveVehicle({
      ...vehicle,
      exit: null,
    })

    await loadVehicles()
  }

  function startEditing(vehicle) {
    setEditingVehicle({
      ...vehicle,
    })

    setEditEntry(toDateTimeLocal(vehicle.entry))
    setEditExit(toDateTimeLocal(vehicle.exit))
  }

  async function updateVehicle() {
    if (!editingVehicle) return

    if (!editingVehicle.plate.trim()) {
      alert('Informe a placa.')
      return
    }

    if (!editEntry) {
      alert('Informe a entrada.')
      return
    }

    const entry = new Date(editEntry)
    const exit = editExit
      ? new Date(editExit)
      : null

    if (
      exit &&
      exit.getTime() < entry.getTime()
    ) {
      alert('A saída não pode ser anterior à entrada.')
      return
    }

    const vehicle = {
      ...editingVehicle,
      plate: editingVehicle.plate
        .trim()
        .toUpperCase(),
      model: editingVehicle.model
        .trim()
        .toUpperCase(),
      color: editingVehicle.color
        .trim()
        .toUpperCase(),
      entry: entry.toISOString(),
      exit: exit
        ? exit.toISOString()
        : null,
    }

    await saveVehicle(vehicle)

    setVehicleDate(getDateKey(vehicle.entry))
    setEditingVehicle(null)

    await loadVehicles()
  }

  async function removeVehicle(vehicle) {
    if (!window.confirm('Excluir este veículo?')) {
      return
    }

    await deleteVehicle(vehicle.id)

    setDeletedVehicle(vehicle)

    clearTimeout(undoTimerRef.current)

    undoTimerRef.current = setTimeout(() => {
      setDeletedVehicle(null)
    }, 6000)

    await loadVehicles()
  }

  async function undoDelete() {
    if (!deletedVehicle) return

    await saveVehicle(deletedVehicle)

    setDeletedVehicle(null)

    clearTimeout(undoTimerRef.current)

    await loadVehicles()
  }

  const todayVehicles = useMemo(() => {
    return vehicles.filter(
      vehicle =>
        getDateKey(vehicle.entry) === today(),
    )
  }, [vehicles])

  const parkedNow = useMemo(() => {
    return vehicles.filter(vehicle => !vehicle.exit)
  }, [vehicles])

  const todayFinished = useMemo(() => {
    return todayVehicles.filter(vehicle => vehicle.exit)
  }, [todayVehicles])

  const todayTotals = useMemo(() => {
    return todayFinished.reduce(
      (total, vehicle) => {
        const calc = calculate(
          vehicle.entry,
          vehicle.exit,
          settings.rate,
        )

        if (!calc) return total

        total.minutes += calc.minutes
        total.proportional += calc.proportional
        total.started += calc.startedHour

        return total
      },
      {
        minutes: 0,
        proportional: 0,
        started: 0,
      },
    )
  }, [todayFinished, settings.rate])

  const filteredVehicles = useMemo(() => {
    const query = search.trim().toUpperCase()

    return vehicles.filter(vehicle => {
      if (
        getDateKey(vehicle.entry) !==
        vehicleDate
      ) {
        return false
      }

      if (
        statusFilter === 'parked' &&
        vehicle.exit
      ) {
        return false
      }

      if (
        statusFilter === 'finished' &&
        !vehicle.exit
      ) {
        return false
      }

      if (!query) return true

      return [
        vehicle.plate,
        vehicle.model,
        vehicle.color,
      ].some(value =>
        String(value || '')
          .toUpperCase()
          .includes(query),
      )
    })
  }, [
    vehicles,
    vehicleDate,
    statusFilter,
    search,
  ])

  const reportVehicles = useMemo(() => {
    return vehicles.filter(vehicle => {
      if (!vehicle.exit) return false

      const date = getDateKey(vehicle.entry)

      return (
        date >= reportStart &&
        date <= reportEnd
      )
    })
  }, [vehicles, reportStart, reportEnd])

  const reportTotals = useMemo(() => {
    return reportVehicles.reduce(
      (total, vehicle) => {
        const calc = calculate(
          vehicle.entry,
          vehicle.exit,
          settings.rate,
        )

        if (!calc) return total

        total.minutes += calc.minutes
        total.proportional += calc.proportional
        total.started += calc.startedHour

        return total
      },
      {
        minutes: 0,
        proportional: 0,
        started: 0,
      },
    )
  }, [reportVehicles, settings.rate])

  function getLiveCalculation(vehicle) {
    return calculate(
      vehicle.entry,
      vehicle.exit ||
        new Date(now).toISOString(),
      settings.rate,
    )
  }

  function generateReport() {
    const lines = reportVehicles.map(vehicle => {
      const calc = calculate(
        vehicle.entry,
        vehicle.exit,
        settings.rate,
      )

      return [
        `${vehicle.model || 'VEÍCULO'} • ${vehicle.color || 'SEM COR'} • ${vehicle.plate}`,
        `${formatTime(vehicle.entry)} → ${formatTime(vehicle.exit)} • ${calc.duration}`,
        `Proporcional: ${money(calc.proportional)}`,
        `Hora iniciada: ${money(calc.startedHour)}`,
      ].join('\n')
    })

    const title =
      reportStart === reportEnd
        ? formatDateKey(reportStart)
        : `${formatDateKey(reportStart)} até ${formatDateKey(reportEnd)}`

    return [
      `ESTACIONAMENTO - ${title}`,
      '',
      ...lines.flatMap(line => [
        line,
        '',
      ]),
      `Veículos: ${reportVehicles.length}`,
      `Tempo total: ${formatDuration(reportTotals.minutes)}`,
      `Proporcional: ${money(reportTotals.proportional)}`,
      `Hora iniciada: ${money(reportTotals.started)}`,
    ].join('\n')
  }

  async function copyReport() {
    await navigator.clipboard.writeText(
      generateReport(),
    )

    setCopied(true)

    setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  async function shareReport() {
    const text = generateReport()

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Relatório de estacionamento',
          text,
        })

        return
      } catch {
        return
      }
    }

    await navigator.clipboard.writeText(text)

    alert('Relatório copiado.')
  }

  function exportCsv() {
    const rows = [
      [
        'Data',
        'Placa',
        'Modelo',
        'Cor',
        'Entrada',
        'Saída',
        'Permanência',
        'Proporcional',
        'Hora iniciada',
      ],
    ]

    reportVehicles.forEach(vehicle => {
      const calc = calculate(
        vehicle.entry,
        vehicle.exit,
        settings.rate,
      )

      rows.push([
        formatFullDate(vehicle.entry),
        vehicle.plate,
        vehicle.model,
        vehicle.color,
        formatTime(vehicle.entry),
        formatTime(vehicle.exit),
        calc.duration,
        calc.proportional.toFixed(2),
        calc.startedHour.toFixed(2),
      ])
    })

    const csv = rows
      .map(row =>
        row.map(escapeCsv).join(';'),
      )
      .join('\n')

    downloadBlob(
      new Blob(
        [`\uFEFF${csv}`],
        {
          type: 'text/csv;charset=utf-8',
        },
      ),
      `estacionamento-${reportStart}-${reportEnd}.csv`,
    )
  }

  async function exportBackup() {
    const data = []

    for (const vehicle of vehicles) {
      data.push({
        ...vehicle,
        photo: vehicle.photo
          ? await blobToDataUrl(vehicle.photo)
          : null,
      })
    }

    const backup = {
      version: 1,
      createdAt: new Date().toISOString(),
      settings,
      vehicles: data,
    }

    downloadBlob(
      new Blob(
        [
          JSON.stringify(
            backup,
            null,
            2,
          ),
        ],
        {
          type: 'application/json',
        },
      ),
      `backup-estacionamento-${today()}.json`,
    )
  }

  async function importBackup(file) {
    if (!file) return

    try {
      const text = await file.text()
      const backup = JSON.parse(text)

      if (!Array.isArray(backup.vehicles)) {
        throw new Error()
      }

      const confirmed = window.confirm(
        'O backup será importado e substituirá os registros atuais. Continuar?',
      )

      if (!confirmed) return

      await clearVehicles()

      for (const item of backup.vehicles) {
        const vehicle = {
          ...item,
          photo: item.photo
            ? await dataUrlToBlob(item.photo)
            : null,
        }

        await saveVehicle(vehicle)
      }

      if (backup.settings) {
        setSettings({
          rate:
            Number(
              backup.settings.rate,
            ) || 2,
          billingMode:
            backup.settings
              .billingMode ||
            'started',
        })
      }

      await loadVehicles()

      alert('Backup importado.')
    } catch {
      alert('Arquivo de backup inválido.')
    }
  }

  function primaryValue(calc) {
    if (!calc) return 0

    return settings.billingMode ===
      'proportional'
      ? calc.proportional
      : calc.startedHour
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-900">
      <header className="sticky top-0 z-30 bg-slate-950 px-4 py-4 text-white shadow">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">
              Estacionamento Studio
            </h1>

            <p className="text-xs text-slate-400">
              {money(settings.rate)}/hora
            </p>
          </div>

          <button
            onClick={() =>
              setSettingsOpen(true)
            }
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold"
          >
            Configurações
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md p-4">
        {tab === 'dashboard' && (
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">
                Hoje
              </h2>

              <p className="text-sm text-slate-500">
                {formatDateKey(today())}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <span className="text-xs text-slate-500">
                  Veículos hoje
                </span>

                <strong className="mt-1 block text-3xl">
                  {todayVehicles.length}
                </strong>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <span className="text-xs text-slate-500">
                  Estacionados agora
                </span>

                <strong className="mt-1 block text-3xl text-green-600">
                  {parkedNow.length}
                </strong>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex justify-between py-2">
                <span>
                  Tempo finalizado
                </span>

                <strong>
                  {formatDuration(
                    todayTotals.minutes,
                  )}
                </strong>
              </div>

              <div className="flex justify-between py-2">
                <span>
                  Proporcional
                </span>

                <strong>
                  {money(
                    todayTotals.proportional,
                  )}
                </strong>
              </div>

              <div className="flex justify-between py-2">
                <span>
                  Hora iniciada
                </span>

                <strong>
                  {money(
                    todayTotals.started,
                  )}
                </strong>
              </div>
            </div>

            <button
              onClick={() => setTab('entry')}
              className="w-full rounded-2xl bg-green-600 p-5 text-lg font-bold text-white"
            >
              Registrar novo veículo
            </button>

            {parkedNow.length > 0 && (
              <div>
                <h3 className="mb-3 font-bold">
                  Estacionados agora
                </h3>

                <div className="space-y-3">
                  {parkedNow.map(vehicle => {
                    const calc =
                      getLiveCalculation(
                        vehicle,
                      )

                    return (
                      <button
                        key={vehicle.id}
                        onClick={() => {
                          setVehicleDate(
                            getDateKey(
                              vehicle.entry,
                            ),
                          )

                          setStatusFilter(
                            'parked',
                          )

                          setTab('vehicles')
                        }}
                        className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-sm"
                      >
                        <div>
                          <strong className="block">
                            {vehicle.plate}
                          </strong>

                          <span className="text-sm text-slate-500">
                            {vehicle.model}
                            {vehicle.color
                              ? ` • ${vehicle.color}`
                              : ''}
                          </span>
                        </div>

                        <strong className="text-green-600">
                          {calc?.duration}
                        </strong>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'entry' && (
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">
                Nova entrada
              </h2>

              <p className="text-sm text-slate-500">
                Registre o veículo.
              </p>
            </div>

            {photo && (
              <VehiclePhoto
                photo={photo}
                onClick={setPreviewPhoto}
                className="h-56 w-full cursor-pointer rounded-2xl object-cover"
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  openCamera('new')
                }
                className="rounded-xl bg-slate-950 p-4 font-bold text-white"
              >
                Câmera
              </button>

              <label className="cursor-pointer rounded-xl bg-white p-4 text-center font-bold shadow-sm">
                Galeria

                <input
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={event =>
                    selectPhoto(
                      event.target.files?.[0],
                    )
                  }
                />
              </label>
            </div>

            <input
              value={plate}
              maxLength={8}
              placeholder="PLACA"
              onChange={event =>
                setPlate(
                  event.target.value.toUpperCase(),
                )
              }
              className="w-full rounded-xl border bg-white p-4 text-lg font-bold uppercase"
            />

            <input
              value={model}
              placeholder="MODELO"
              onChange={event =>
                setModel(
                  event.target.value.toUpperCase(),
                )
              }
              className="w-full rounded-xl border bg-white p-4 uppercase"
            />

            <input
              value={color}
              placeholder="COR"
              onChange={event =>
                setColor(
                  event.target.value.toUpperCase(),
                )
              }
              className="w-full rounded-xl border bg-white p-4 uppercase"
            />

            <button
              onClick={registerEntry}
              className="w-full rounded-xl bg-green-600 p-4 font-bold text-white"
            >
              Registrar entrada agora
            </button>
          </section>
        )}

        {tab === 'vehicles' && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">
              Veículos
            </h2>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setVehicleDate(
                      shiftDate(
                        vehicleDate,
                        -1,
                      ),
                    )
                  }
                  className="rounded-xl bg-slate-200 px-4 font-bold"
                >
                  ←
                </button>

                <input
                  type="date"
                  value={vehicleDate}
                  onChange={event =>
                    setVehicleDate(
                      event.target.value,
                    )
                  }
                  className="min-w-0 flex-1 rounded-xl border p-3"
                />

                <button
                  onClick={() =>
                    setVehicleDate(
                      shiftDate(
                        vehicleDate,
                        1,
                      ),
                    )
                  }
                  className="rounded-xl bg-slate-200 px-4 font-bold"
                >
                  →
                </button>
              </div>

              <button
                onClick={() =>
                  setVehicleDate(today())
                }
                className="mt-2 w-full rounded-xl bg-slate-950 p-3 font-bold text-white"
              >
                Hoje
              </button>
            </div>

            <input
              value={search}
              placeholder="BUSCAR PLACA, MODELO OU COR"
              onChange={event =>
                setSearch(
                  event.target.value.toUpperCase(),
                )
              }
              className="w-full rounded-xl border bg-white p-4 uppercase"
            />

            <div className="grid grid-cols-3 gap-2">
              {[
                ['all', 'Todos'],
                ['parked', 'Estacionados'],
                ['finished', 'Finalizados'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() =>
                    setStatusFilter(value)
                  }
                  className={`rounded-xl p-3 text-xs font-bold ${
                    statusFilter === value
                      ? 'bg-slate-950 text-white'
                      : 'bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="text-sm text-slate-500">
              {filteredVehicles.length}{' '}
              registro(s)
            </div>

            {filteredVehicles.map(vehicle => {
              const calc =
                getLiveCalculation(vehicle)

              return (
                <article
                  key={vehicle.id}
                  className="rounded-2xl bg-white p-4 shadow-sm"
                >
                  <div className="flex gap-4">
                    {vehicle.photo ? (
                      <VehiclePhoto
                        photo={vehicle.photo}
                        onClick={
                          setPreviewPhoto
                        }
                        className="h-24 w-24 cursor-pointer rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                        SEM FOTO
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <strong className="block text-lg">
                            {vehicle.plate}
                          </strong>

                          <span className="text-sm text-slate-500">
                            {vehicle.model}
                            {vehicle.color
                              ? ` • ${vehicle.color}`
                              : ''}
                          </span>
                        </div>

                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                            vehicle.exit
                              ? 'bg-slate-200'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {vehicle.exit
                            ? 'FINALIZADO'
                            : 'ESTACIONADO'}
                        </span>
                      </div>

                      <div className="mt-3 text-sm">
                        {formatTime(
                          vehicle.entry,
                        )}
                        {' → '}
                        {formatTime(
                          vehicle.exit,
                        )}
                      </div>

                      <div className="mt-1 font-bold">
                        {calc?.duration}
                      </div>

                      {calc && (
                        <div className="mt-1 text-sm text-slate-500">
                          Principal:{' '}
                          {money(
                            primaryValue(calc),
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {!vehicle.exit ? (
                      <button
                        onClick={() =>
                          requestExit(vehicle)
                        }
                        className="rounded-xl bg-green-600 p-3 font-bold text-white"
                      >
                        Saída
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          reopenVehicle(
                            vehicle,
                          )
                        }
                        className="rounded-xl bg-amber-100 p-3 font-bold text-amber-800"
                      >
                        Desfazer saída
                      </button>
                    )}

                    <button
                      onClick={() =>
                        startEditing(vehicle)
                      }
                      className="rounded-xl bg-blue-600 p-3 font-bold text-white"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() =>
                        removeVehicle(vehicle)
                      }
                      className="col-span-2 rounded-xl bg-slate-100 p-3 font-semibold"
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              )
            })}
          </section>
        )}

        {tab === 'report' && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">
              Relatórios
            </h2>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold">
                  Início
                </label>

                <input
                  type="date"
                  value={reportStart}
                  onChange={event =>
                    setReportStart(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border bg-white p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold">
                  Fim
                </label>

                <input
                  type="date"
                  value={reportEnd}
                  onChange={event =>
                    setReportEnd(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border bg-white p-3"
                />
              </div>
            </div>

            <button
              onClick={() => {
                setReportStart(today())
                setReportEnd(today())
              }}
              className="w-full rounded-xl bg-slate-950 p-3 font-bold text-white"
            >
              Hoje
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <span className="text-xs text-slate-500">
                  Veículos
                </span>

                <strong className="block text-2xl">
                  {reportVehicles.length}
                </strong>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <span className="text-xs text-slate-500">
                  Tempo
                </span>

                <strong className="block text-2xl">
                  {formatDuration(
                    reportTotals.minutes,
                  )}
                </strong>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex justify-between py-2">
                <span>Proporcional</span>
                <strong>
                  {money(
                    reportTotals.proportional,
                  )}
                </strong>
              </div>

              <div className="flex justify-between py-2">
                <span>Hora iniciada</span>
                <strong>
                  {money(
                    reportTotals.started,
                  )}
                </strong>
              </div>
            </div>

            {reportVehicles.length > 0 && (
              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6">
                  {generateReport()}
                </pre>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyReport}
                className="rounded-xl bg-slate-950 p-4 font-bold text-white"
              >
                {copied
                  ? 'Copiado'
                  : 'Copiar'}
              </button>

              <button
                onClick={shareReport}
                className="rounded-xl bg-green-600 p-4 font-bold text-white"
              >
                Compartilhar
              </button>
            </div>

            <button
              onClick={exportCsv}
              className="w-full rounded-xl bg-white p-4 font-bold shadow-sm"
            >
              Exportar CSV
            </button>
          </section>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {[
            ['dashboard', 'Início'],
            ['entry', 'Entrada'],
            ['vehicles', 'Veículos'],
            ['report', 'Relatórios'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`p-4 text-xs font-bold ${
                tab === value
                  ? 'bg-slate-950 text-white'
                  : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {exitVehicle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto mt-20 max-w-md space-y-4 rounded-2xl bg-white p-5">
            <h2 className="text-xl font-bold">
              Confirmar saída
            </h2>

            <div>
              <strong className="text-lg">
                {exitVehicle.plate}
              </strong>

              <p className="text-sm text-slate-500">
                {exitVehicle.model} •{' '}
                {exitVehicle.color}
              </p>
            </div>

            <div className="text-sm">
              Entrada:{' '}
              <strong>
                {formatTime(
                  exitVehicle.entry,
                )}
              </strong>
            </div>

            <input
              type="datetime-local"
              value={exitDateTime}
              onChange={event =>
                setExitDateTime(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border p-4"
            />

            {exitDateTime &&
              (() => {
                const calc = calculate(
                  exitVehicle.entry,
                  new Date(
                    exitDateTime,
                  ).toISOString(),
                  settings.rate,
                )

                if (!calc) return null

                return (
                  <div className="space-y-2 rounded-xl bg-slate-100 p-4">
                    <div className="flex justify-between">
                      <span>
                        Permanência
                      </span>
                      <strong>
                        {calc.duration}
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span>
                        Proporcional
                      </span>
                      <strong>
                        {money(
                          calc.proportional,
                        )}
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span>
                        Hora iniciada
                      </span>
                      <strong>
                        {money(
                          calc.startedHour,
                        )}
                      </strong>
                    </div>
                  </div>
                )
              })()}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  setExitVehicle(null)
                }
                className="rounded-xl bg-slate-200 p-4 font-bold"
              >
                Cancelar
              </button>

              <button
                onClick={confirmExit}
                className="rounded-xl bg-green-600 p-4 font-bold text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingVehicle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto my-6 max-w-md space-y-4 rounded-2xl bg-slate-100 p-4">
            <div className="flex justify-between">
              <h2 className="text-xl font-bold">
                Editar veículo
              </h2>

              <button
                onClick={() =>
                  setEditingVehicle(null)
                }
                className="rounded-xl bg-slate-200 px-4"
              >
                Fechar
              </button>
            </div>

            {editingVehicle.photo && (
              <VehiclePhoto
                photo={
                  editingVehicle.photo
                }
                onClick={setPreviewPhoto}
                className="h-52 w-full rounded-2xl object-cover"
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  openCamera('edit')
                }
                className="rounded-xl bg-slate-950 p-3 font-bold text-white"
              >
                Câmera
              </button>

              <label className="cursor-pointer rounded-xl bg-white p-3 text-center font-bold">
                Galeria

                <input
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={event =>
                    selectPhoto(
                      event.target.files?.[0],
                      'edit',
                    )
                  }
                />
              </label>
            </div>

            <input
              value={
                editingVehicle.plate
              }
              onChange={event =>
                setEditingVehicle(
                  current => ({
                    ...current,
                    plate:
                      event.target.value.toUpperCase(),
                  }),
                )
              }
              placeholder="PLACA"
              className="w-full rounded-xl border bg-white p-4 uppercase"
            />

            <input
              value={
                editingVehicle.model
              }
              onChange={event =>
                setEditingVehicle(
                  current => ({
                    ...current,
                    model:
                      event.target.value.toUpperCase(),
                  }),
                )
              }
              placeholder="MODELO"
              className="w-full rounded-xl border bg-white p-4 uppercase"
            />

            <input
              value={
                editingVehicle.color
              }
              onChange={event =>
                setEditingVehicle(
                  current => ({
                    ...current,
                    color:
                      event.target.value.toUpperCase(),
                  }),
                )
              }
              placeholder="COR"
              className="w-full rounded-xl border bg-white p-4 uppercase"
            />

            <label className="text-sm font-bold">
              Entrada
            </label>

            <input
              type="datetime-local"
              value={editEntry}
              onChange={event =>
                setEditEntry(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border bg-white p-4"
            />

            <label className="text-sm font-bold">
              Saída
            </label>

            <input
              type="datetime-local"
              value={editExit}
              onChange={event =>
                setEditExit(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border bg-white p-4"
            />

            <button
              onClick={() =>
                setEditExit('')
              }
              className="w-full rounded-xl bg-slate-200 p-3 font-bold"
            >
              Remover saída
            </button>

            <button
              onClick={() =>
                setEditingVehicle(
                  current => ({
                    ...current,
                    photo: null,
                  }),
                )
              }
              className="w-full rounded-xl bg-slate-200 p-3 font-bold"
            >
              Remover foto
            </button>

            <button
              onClick={updateVehicle}
              className="w-full rounded-xl bg-green-600 p-4 font-bold text-white"
            >
              Salvar alterações
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto my-10 max-w-md space-y-4 rounded-2xl bg-white p-5">
            <div className="flex justify-between">
              <h2 className="text-xl font-bold">
                Configurações
              </h2>

              <button
                onClick={() =>
                  setSettingsOpen(false)
                }
                className="rounded-xl bg-slate-200 px-4"
              >
                Fechar
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold">
                Valor por hora
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.rate}
                onChange={event =>
                  setSettings(current => ({
                    ...current,
                    rate:
                      Number(
                        event.target.value,
                      ) || 0,
                  }))
                }
                className="w-full rounded-xl border p-4"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                Cobrança principal
              </label>

              <select
                value={
                  settings.billingMode
                }
                onChange={event =>
                  setSettings(current => ({
                    ...current,
                    billingMode:
                      event.target.value,
                  }))
                }
                className="w-full rounded-xl border p-4"
              >
                <option value="started">
                  Hora iniciada
                </option>

                <option value="proportional">
                  Proporcional
                </option>
              </select>
            </div>

            <div className="border-t pt-4">
              <h3 className="mb-3 font-bold">
                Backup
              </h3>

              <button
                onClick={exportBackup}
                className="mb-2 w-full rounded-xl bg-slate-950 p-4 font-bold text-white"
              >
                Exportar backup
              </button>

              <label className="block cursor-pointer rounded-xl bg-slate-200 p-4 text-center font-bold">
                Importar backup

                <input
                  hidden
                  type="file"
                  accept=".json,application/json"
                  onChange={event =>
                    importBackup(
                      event.target.files?.[0],
                    )
                  }
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="min-h-0 flex-1 object-cover"
          />

          <div className="grid grid-cols-2 gap-3 p-4">
            <button
              onClick={closeCamera}
              className="rounded-xl bg-slate-700 p-4 font-bold text-white"
            >
              Cancelar
            </button>

            <button
              onClick={takePhoto}
              className="rounded-xl bg-white p-4 font-bold"
            >
              Tirar foto
            </button>
          </div>
        </div>
      )}

      {previewPhoto && (
        <div
          onClick={() =>
            setPreviewPhoto('')
          }
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 p-4"
        >
          <img
            src={previewPhoto}
            alt="Veículo"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}

      {deletedVehicle && (
        <div className="fixed bottom-24 left-4 right-4 z-[120] mx-auto flex max-w-md items-center justify-between rounded-xl bg-slate-950 p-4 text-white shadow-xl">
          <span>
            Veículo excluído
          </span>

          <button
            onClick={undoDelete}
            className="font-bold text-green-400"
          >
            Desfazer
          </button>
        </div>
      )}
    </div>
  )
}
