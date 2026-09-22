import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteVehicle, getVehicles, saveVehicle } from './db'

const RATE = 2

function money(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatTime(date) {
  if (!date) return '--:--'

  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getDateKey(date) {
  const value = new Date(date)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function today() {
  return getDateKey(new Date())
}

function formatDate(date) {
  if (!date) return ''

  const [year, month, day] = date.split('-')

  return `${day}/${month}/${year}`
}

function toDateTimeLocal(iso) {
  if (!iso) return ''

  const date = new Date(iso)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hour}:${minute}`
}

function calculate(entry, exit) {
  if (!entry || !exit) return null

  const start = new Date(entry)
  const end = new Date(exit)

  const minutes = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 60000),
  )

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  let duration = ''

  if (hours > 0 && remainingMinutes > 0) {
    duration = `${hours}h${String(remainingMinutes).padStart(2, '0')}min`
  } else if (hours > 0) {
    duration = `${hours}h`
  } else {
    duration = `${minutes}min`
  }

  return {
    minutes,
    duration,
    proportional: (minutes / 60) * RATE,
    startedHour: minutes > 0 ? Math.ceil(minutes / 60) * RATE : 0,
  }
}

function formatTotalDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h${String(remainingMinutes).padStart(2, '0')}min`
  }

  if (hours > 0) {
    return `${hours}h`
  }

  return `${minutes}min`
}

function VehiclePhoto({ photo, className = '' }) {
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

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [photo])

  if (!url) return null

  return (
    <img
      src={url}
      alt="Veículo"
      className={className}
    />
  )
}

export default function App() {
  const [vehicles, setVehicles] = useState([])

  const [plate, setPlate] = useState('')
  const [model, setModel] = useState('')
  const [color, setColor] = useState('')
  const [photo, setPhoto] = useState(null)

  const [tab, setTab] = useState('vehicles')

  const [vehicleDate, setVehicleDate] = useState(today())
  const [reportDate, setReportDate] = useState(today())

  const [copied, setCopied] = useState(false)

  const [editingVehicle, setEditingVehicle] = useState(null)
  const [editEntry, setEditEntry] = useState('')
  const [editExit, setEditExit] = useState('')

  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraTarget, setCameraTarget] = useState('new')

  const videoRef = useRef(null)

  async function loadVehicles() {
    const data = await getVehicles()

    data.sort((a, b) => {
      return new Date(b.entry) - new Date(a.entry)
    })

    setVehicles(data)
  }

  useEffect(() => {
    loadVehicles()
  }, [])

  useEffect(() => {
    if (!cameraOpen) return
    if (!cameraStream) return
    if (!videoRef.current) return

    videoRef.current.srcObject = cameraStream

    videoRef.current.play().catch(() => {})
  }, [cameraOpen, cameraStream])

  function stopCameraStream(stream) {
    if (!stream) return

    stream.getTracks().forEach(track => {
      track.stop()
    })
  }

  function closeCamera() {
    stopCameraStream(cameraStream)

    setCameraStream(null)
    setCameraOpen(false)
  }

  async function openCamera(target = 'new') {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('A câmera não está disponível neste navegador.')
      return
    }

    let stream = null

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
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        } catch {
          alert('Não foi possível acessar a câmera.')
          return
        }
      }
    }

    setCameraTarget(target)
    setCameraStream(stream)
    setCameraOpen(true)
  }

  function takePhoto() {
    const video = videoRef.current

    if (!video) return
    if (!video.videoWidth) return
    if (!video.videoHeight) return

    const canvas = document.createElement('canvas')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    canvas.toBlob(
      blob => {
        if (!blob) return

        if (cameraTarget === 'edit') {
          setEditingVehicle(current => ({
            ...current,
            photo: blob,
          }))
        } else {
          setPhoto(blob)
        }

        closeCamera()
      },
      'image/jpeg',
      0.9,
    )
  }

  async function registerEntry() {
    if (!plate.trim()) {
      alert('Informe a placa do veículo.')
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

  async function registerExit(vehicle) {
    await saveVehicle({
      ...vehicle,
      exit: new Date().toISOString(),
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

  function cancelEditing() {
    setEditingVehicle(null)
    setEditEntry('')
    setEditExit('')
  }

  async function updateVehicle() {
    if (!editingVehicle) return

    if (!editingVehicle.plate?.trim()) {
      alert('Informe a placa.')
      return
    }

    if (!editEntry) {
      alert('Informe a data e o horário de entrada.')
      return
    }

    const entryDate = new Date(editEntry)

    if (Number.isNaN(entryDate.getTime())) {
      alert('Data de entrada inválida.')
      return
    }

    let exitDate = null

    if (editExit) {
      exitDate = new Date(editExit)

      if (Number.isNaN(exitDate.getTime())) {
        alert('Data de saída inválida.')
        return
      }

      if (exitDate < entryDate) {
        alert('A saída não pode ser anterior à entrada.')
        return
      }
    }

    const updatedVehicle = {
      id: editingVehicle.id,

      plate:
        editingVehicle.plate
          ?.trim()
          .toUpperCase() || '',

      model:
        editingVehicle.model
          ?.trim()
          .toUpperCase() || '',

      color:
        editingVehicle.color
          ?.trim()
          .toUpperCase() || '',

      photo: editingVehicle.photo || null,

      entry: entryDate.toISOString(),

      exit: exitDate
        ? exitDate.toISOString()
        : null,
    }

    await saveVehicle(updatedVehicle)

    setVehicleDate(getDateKey(updatedVehicle.entry))

    cancelEditing()

    await loadVehicles()
  }

  async function removeVehicle(id) {
    const confirmed = window.confirm(
      'Deseja excluir este veículo?',
    )

    if (!confirmed) return

    await deleteVehicle(id)

    await loadVehicles()
  }

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(vehicle => {
      return getDateKey(vehicle.entry) === vehicleDate
    })
  }, [vehicles, vehicleDate])

  const parkedVehicles = useMemo(() => {
    return filteredVehicles.filter(vehicle => {
      return !vehicle.exit
    })
  }, [filteredVehicles])

  const finishedVehicles = useMemo(() => {
    return filteredVehicles.filter(vehicle => {
      return vehicle.exit
    })
  }, [filteredVehicles])

  const reportVehicles = useMemo(() => {
    return vehicles.filter(vehicle => {
      if (!vehicle.exit) return false

      return getDateKey(vehicle.entry) === reportDate
    })
  }, [vehicles, reportDate])

  const totals = useMemo(() => {
    return reportVehicles.reduce(
      (total, vehicle) => {
        const calculation = calculate(
          vehicle.entry,
          vehicle.exit,
        )

        if (!calculation) return total

        total.minutes += calculation.minutes
        total.proportional += calculation.proportional
        total.startedHour += calculation.startedHour

        return total
      },
      {
        minutes: 0,
        proportional: 0,
        startedHour: 0,
      },
    )
  }, [reportVehicles])

  function generateReport() {
    const lines = reportVehicles.map(vehicle => {
      const calculation = calculate(
        vehicle.entry,
        vehicle.exit,
      )

      const identification = [
        vehicle.model,
        vehicle.color,
        vehicle.plate,
      ]
        .filter(Boolean)
        .join(' - ')

      return `${identification} | ${formatTime(vehicle.entry)} às ${formatTime(vehicle.exit)} | ${calculation.duration} | Proporcional: ${money(calculation.proportional)} | Hora iniciada: ${money(calculation.startedHour)}`
    })

    return [
      `RESUMO - ${formatDate(reportDate)}`,
      `R$ ${RATE.toFixed(2).replace('.', ',')}/HORA`,
      '',
      ...lines,
      '',
      `VEÍCULOS: ${reportVehicles.length}`,
      `TEMPO TOTAL: ${formatTotalDuration(totals.minutes)}`,
      `TOTAL PROPORCIONAL: ${money(totals.proportional)}`,
      `TOTAL POR HORA INICIADA: ${money(totals.startedHour)}`,
    ].join('\n')
  }

  async function copyReport() {
    if (!reportVehicles.length) {
      alert(
        'Não existem veículos finalizados nesta data.',
      )
      return
    }

    try {
      await navigator.clipboard.writeText(
        generateReport(),
      )

      setCopied(true)

      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch {
      alert('Não foi possível copiar o relatório.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-900">
      <header className="bg-slate-950 px-5 py-5 text-white">
        <div className="mx-auto max-w-md">
          <h1 className="text-xl font-bold">
            Estacionamento Studio
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Tarifa de {money(RATE)} por hora
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-md p-4">
        {tab === 'entry' && (
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">
                Nova entrada
              </h2>

              <p className="text-sm text-slate-500">
                Registre os dados do veículo.
              </p>
            </div>

            {photo && (
              <div className="overflow-hidden rounded-2xl bg-white">
                <VehiclePhoto
                  photo={photo}
                  className="h-56 w-full object-cover"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => openCamera('new')}
              className="w-full rounded-xl bg-slate-950 p-4 font-bold text-white"
            >
              Abrir câmera traseira
            </button>

            <label className="block cursor-pointer rounded-xl bg-white p-4 text-center font-semibold shadow-sm">
              Selecionar foto do celular

              <input
                hidden
                type="file"
                accept="image/*"
                onChange={event => {
                  setPhoto(
                    event.target.files?.[0] || null,
                  )
                }}
              />
            </label>

            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="w-full rounded-xl bg-slate-200 p-3 font-semibold"
              >
                Remover foto
              </button>
            )}

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Placa
              </label>

              <input
                value={plate}
                maxLength={8}
                autoComplete="off"
                placeholder="ABC1D23"
                onChange={event => {
                  setPlate(
                    event.target.value.toUpperCase(),
                  )
                }}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 text-lg font-bold uppercase outline-none focus:border-slate-950"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Modelo
              </label>

              <input
                value={model}
                autoComplete="off"
                placeholder="CIVIC"
                onChange={event => {
                  setModel(
                    event.target.value.toUpperCase(),
                  )
                }}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 uppercase outline-none focus:border-slate-950"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Cor
              </label>

              <input
                value={color}
                autoComplete="off"
                placeholder="PRETO"
                onChange={event => {
                  setColor(
                    event.target.value.toUpperCase(),
                  )
                }}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 uppercase outline-none focus:border-slate-950"
              />
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">
                Horário de entrada
              </div>

              <div className="mt-1 font-bold">
                Será registrado automaticamente
              </div>
            </div>

            <button
              type="button"
              onClick={registerEntry}
              className="w-full rounded-xl bg-green-600 p-4 font-bold text-white active:scale-[0.99]"
            >
              Registrar entrada agora
            </button>
          </section>
        )}

        {tab === 'vehicles' && (
          <section className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Veículos
                </h2>

                <p className="text-sm text-slate-500">
                  Controle de entradas e saídas
                </p>
              </div>

              <div className="rounded-full bg-green-600 px-3 py-1 text-sm font-bold text-white">
                {parkedVehicles.length}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <label className="mb-2 block text-sm font-semibold">
                Filtrar por data
              </label>

              <div className="flex gap-2">
                <input
                  type="date"
                  value={vehicleDate}
                  onChange={event => {
                    setVehicleDate(
                      event.target.value,
                    )
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 p-4 outline-none focus:border-slate-950"
                />

                <button
                  type="button"
                  onClick={() => {
                    setVehicleDate(today())
                  }}
                  className="rounded-xl bg-slate-950 px-4 font-bold text-white"
                >
                  Hoje
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                <div className="text-xs text-slate-500">
                  Total
                </div>

                <div className="mt-1 text-xl font-bold">
                  {filteredVehicles.length}
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                <div className="text-xs text-slate-500">
                  Estacionados
                </div>

                <div className="mt-1 text-xl font-bold text-green-600">
                  {parkedVehicles.length}
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                <div className="text-xs text-slate-500">
                  Finalizados
                </div>

                <div className="mt-1 text-xl font-bold">
                  {finishedVehicles.length}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-200 px-4 py-3 text-sm">
              Registros de{' '}
              <strong>
                {formatDate(vehicleDate)}
              </strong>
            </div>

            {filteredVehicles.length === 0 && (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                <p className="font-bold">
                  Nenhum veículo nesta data
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Não existem registros em{' '}
                  {formatDate(vehicleDate)}.
                </p>
              </div>
            )}

            {filteredVehicles.map(vehicle => {
              const calculation = calculate(
                vehicle.entry,
                vehicle.exit,
              )

              return (
                <article
                  key={vehicle.id}
                  className="overflow-hidden rounded-2xl bg-white shadow-sm"
                >
                  {vehicle.photo && (
                    <VehiclePhoto
                      photo={vehicle.photo}
                      className="h-48 w-full object-cover"
                    />
                  )}

                  <div className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xl font-bold">
                          {vehicle.plate}
                        </div>

                        <div className="mt-1 text-sm text-slate-500">
                          {[
                            vehicle.model,
                            vehicle.color,
                          ]
                            .filter(Boolean)
                            .join(' • ') ||
                            'SEM DESCRIÇÃO'}
                        </div>
                      </div>

                      {vehicle.exit ? (
                        <span className="h-fit rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                          FINALIZADO
                        </span>
                      ) : (
                        <span className="h-fit rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                          ESTACIONADO
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-slate-100 p-3">
                        <div className="text-xs text-slate-500">
                          Entrada
                        </div>

                        <div className="mt-1 font-bold">
                          {formatTime(
                            vehicle.entry,
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-100 p-3">
                        <div className="text-xs text-slate-500">
                          Saída
                        </div>

                        <div className="mt-1 font-bold">
                          {vehicle.exit
                            ? formatTime(
                                vehicle.exit,
                              )
                            : '--:--'}
                        </div>
                      </div>
                    </div>

                    {vehicle.exit &&
                      calculation && (
                        <div className="space-y-2 border-t border-slate-200 pt-4">
                          <div className="flex justify-between">
                            <span className="text-slate-500">
                              Permanência
                            </span>

                            <strong>
                              {
                                calculation.duration
                              }
                            </strong>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-slate-500">
                              Proporcional
                            </span>

                            <strong>
                              {money(
                                calculation.proportional,
                              )}
                            </strong>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-slate-500">
                              Hora iniciada
                            </span>

                            <strong>
                              {money(
                                calculation.startedHour,
                              )}
                            </strong>
                          </div>
                        </div>
                      )}

                    {!vehicle.exit && (
                      <button
                        type="button"
                        onClick={() => {
                          registerExit(vehicle)
                        }}
                        className="w-full rounded-xl bg-green-600 p-4 font-bold text-white"
                      >
                        Registrar saída agora
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        startEditing(vehicle)
                      }}
                      className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white"
                    >
                      Editar veículo
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        removeVehicle(
                          vehicle.id,
                        )
                      }}
                      className="w-full rounded-xl bg-slate-100 p-3 font-semibold text-slate-600"
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
            <div>
              <h2 className="text-xl font-bold">
                Relatórios
              </h2>

              <p className="text-sm text-slate-500">
                Consulte os veículos por data.
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <label className="mb-2 block text-sm font-semibold">
                Data
              </label>

              <div className="flex gap-2">
                <input
                  type="date"
                  value={reportDate}
                  onChange={event => {
                    setReportDate(
                      event.target.value,
                    )
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 p-4 outline-none"
                />

                <button
                  type="button"
                  onClick={() => {
                    setReportDate(today())
                  }}
                  className="rounded-xl bg-slate-950 px-4 font-bold text-white"
                >
                  Hoje
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="text-xs text-slate-500">
                  Veículos
                </div>

                <div className="mt-1 text-2xl font-bold">
                  {reportVehicles.length}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="text-xs text-slate-500">
                  Tempo total
                </div>

                <div className="mt-1 text-2xl font-bold">
                  {formatTotalDuration(
                    totals.minutes,
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex justify-between border-b border-slate-100 py-3">
                <span className="text-slate-500">
                  Proporcional
                </span>

                <strong>
                  {money(
                    totals.proportional,
                  )}
                </strong>
              </div>

              <div className="flex justify-between py-3">
                <span className="text-slate-500">
                  Hora iniciada
                </span>

                <strong>
                  {money(
                    totals.startedHour,
                  )}
                </strong>
              </div>
            </div>

            {reportVehicles.length === 0 && (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                <p className="font-bold">
                  Nenhum registro
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Não existem veículos
                  finalizados em{' '}
                  {formatDate(reportDate)}.
                </p>
              </div>
            )}

            {reportVehicles.length > 0 && (
              <>
                <div className="rounded-2xl bg-slate-950 p-4 text-white">
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
                    {generateReport()}
                  </pre>
                </div>

                <button
                  type="button"
                  onClick={copyReport}
                  className="w-full rounded-xl bg-slate-950 p-4 font-bold text-white"
                >
                  {copied
                    ? 'Relatório copiado!'
                    : 'Copiar relatório'}
                </button>
              </>
            )}
          </section>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-md grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setTab('entry')
            }}
            className={`p-4 text-sm font-bold ${
              tab === 'entry'
                ? 'bg-slate-950 text-white'
                : 'text-slate-600'
            }`}
          >
            Entrada
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('vehicles')
            }}
            className={`p-4 text-sm font-bold ${
              tab === 'vehicles'
                ? 'bg-slate-950 text-white'
                : 'text-slate-600'
            }`}
          >
            Veículos
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('report')
            }}
            className={`p-4 text-sm font-bold ${
              tab === 'report'
                ? 'bg-slate-950 text-white'
                : 'text-slate-600'
            }`}
          >
            Relatórios
          </button>
        </div>
      </nav>

      {editingVehicle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4">
          <div className="mx-auto my-4 max-w-md space-y-4 rounded-2xl bg-slate-100 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                Editar veículo
              </h2>

              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-lg bg-slate-200 px-4 py-2 font-semibold"
              >
                Fechar
              </button>
            </div>

            {editingVehicle.photo && (
              <VehiclePhoto
                photo={
                  editingVehicle.photo
                }
                className="h-56 w-full rounded-2xl object-cover"
              />
            )}

            <button
              type="button"
              onClick={() => {
                openCamera('edit')
              }}
              className="w-full rounded-xl bg-slate-950 p-4 font-bold text-white"
            >
              Tirar nova foto
            </button>

            <label className="block cursor-pointer rounded-xl bg-white p-4 text-center font-semibold">
              Selecionar outra foto

              <input
                hidden
                type="file"
                accept="image/*"
                onChange={event => {
                  const selected =
                    event.target.files?.[0]

                  if (!selected) return

                  setEditingVehicle(
                    current => ({
                      ...current,
                      photo: selected,
                    }),
                  )
                }}
              />
            </label>

            {editingVehicle.photo && (
              <button
                type="button"
                onClick={() => {
                  setEditingVehicle(
                    current => ({
                      ...current,
                      photo: null,
                    }),
                  )
                }}
                className="w-full rounded-xl bg-slate-200 p-3 font-semibold"
              >
                Remover foto
              </button>
            )}

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Placa
              </label>

              <input
                value={
                  editingVehicle.plate ||
                  ''
                }
                onChange={event => {
                  setEditingVehicle(
                    current => ({
                      ...current,

                      plate:
                        event.target.value.toUpperCase(),
                    }),
                  )
                }}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 uppercase outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Modelo
              </label>

              <input
                value={
                  editingVehicle.model ||
                  ''
                }
                onChange={event => {
                  setEditingVehicle(
                    current => ({
                      ...current,

                      model:
                        event.target.value.toUpperCase(),
                    }),
                  )
                }}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 uppercase outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Cor
              </label>

              <input
                value={
                  editingVehicle.color ||
                  ''
                }
                onChange={event => {
                  setEditingVehicle(
                    current => ({
                      ...current,

                      color:
                        event.target.value.toUpperCase(),
                    }),
                  )
                }}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 uppercase outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Entrada
              </label>

              <input
                type="datetime-local"
                value={editEntry}
                onChange={event => {
                  setEditEntry(
                    event.target.value,
                  )
                }}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Saída
              </label>

              <input
                type="datetime-local"
                value={editExit}
                onChange={event => {
                  setEditExit(
                    event.target.value,
                  )
                }}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 outline-none"
              />

              <button
                type="button"
                onClick={() => {
                  setEditExit('')
                }}
                className="mt-2 w-full rounded-xl bg-slate-200 p-3 font-semibold"
              >
                Remover horário de saída
              </button>
            </div>

            {editEntry &&
              editExit &&
              (() => {
                const calculation =
                  calculate(
                    new Date(
                      editEntry,
                    ).toISOString(),

                    new Date(
                      editExit,
                    ).toISOString(),
                  )

                if (!calculation) {
                  return null
                }

                return (
                  <div className="space-y-2 rounded-2xl bg-white p-4">
                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        Permanência
                      </span>

                      <strong>
                        {
                          calculation.duration
                        }
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        Proporcional
                      </span>

                      <strong>
                        {money(
                          calculation.proportional,
                        )}
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        Hora iniciada
                      </span>

                      <strong>
                        {money(
                          calculation.startedHour,
                        )}
                      </strong>
                    </div>
                  </div>
                )
              })()}

            <button
              type="button"
              onClick={updateVehicle}
              className="w-full rounded-xl bg-green-600 p-4 font-bold text-white"
            >
              Salvar alterações
            </button>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <div className="min-h-0 flex-1">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 bg-black p-4">
            <button
              type="button"
              onClick={closeCamera}
              className="rounded-xl bg-slate-700 p-4 font-bold text-white"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={takePhoto}
              className="rounded-xl bg-white p-4 font-bold text-black"
            >
              Tirar foto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
