import { useEffect, useMemo, useState } from 'react'
import { deleteVehicle, getVehicles, saveVehicle } from './db'

const RATE = 2

function money(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatTime(date) {
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

function VehiclePhoto({ photo, className }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!photo) {
      setUrl('')
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
  const [reportDate, setReportDate] = useState(today())
  const [copied, setCopied] = useState(false)

  async function loadVehicles() {
    const data = await getVehicles()

    data.sort((a, b) => new Date(b.entry) - new Date(a.entry))

    setVehicles(data)
  }

  useEffect(() => {
    loadVehicles()
  }, [])

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

    await loadVehicles()

    setTab('vehicles')
  }

  async function registerExit(vehicle) {
    const updatedVehicle = {
      ...vehicle,
      exit: new Date().toISOString(),
    }

    await saveVehicle(updatedVehicle)

    await loadVehicles()
  }

  async function removeVehicle(id) {
    const confirmed = window.confirm('Deseja excluir este veículo?')

    if (!confirmed) return

    await deleteVehicle(id)

    await loadVehicles()
  }

  const parkedVehicles = useMemo(() => {
    return vehicles.filter(vehicle => !vehicle.exit)
  }, [vehicles])

  const reportVehicles = useMemo(() => {
    return vehicles.filter(vehicle => {
      if (!vehicle.exit) return false

      return getDateKey(vehicle.entry) === reportDate
    })
  }, [vehicles, reportDate])

  const totals = useMemo(() => {
    return reportVehicles.reduce(
      (total, vehicle) => {
        const calculation = calculate(vehicle.entry, vehicle.exit)

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

  function generateReport() {
    const lines = reportVehicles.map(vehicle => {
      const calculation = calculate(vehicle.entry, vehicle.exit)

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
      alert('Não existem veículos finalizados nesta data.')
      return
    }

    try {
      await navigator.clipboard.writeText(generateReport())

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

            <label className="block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white">
              {photo ? (
                <VehiclePhoto
                  photo={photo}
                  className="h-56 w-full object-cover"
                />
              ) : (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-500">
                  <span className="text-3xl">
                    📷
                  </span>

                  <span className="font-medium">
                    Tirar foto do veículo
                  </span>
                </div>
              )}

              <input
                hidden
                type="file"
                accept="image/*"
                capture="environment"
                onChange={event => {
                  setPhoto(event.target.files?.[0] || null)
                }}
              />
            </label>

            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="w-full rounded-xl bg-slate-200 p-3 text-sm font-semibold"
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
                onChange={event =>
                  setPlate(event.target.value.toUpperCase())
                }
                placeholder="ABC1D23"
                maxLength={8}
                autoComplete="off"
                className="w-full rounded-xl border border-slate-300 bg-white p-4 text-lg font-semibold uppercase outline-none focus:border-slate-950"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Modelo
              </label>

              <input
                value={model}
                onChange={event =>
                  setModel(event.target.value.toUpperCase())
                }
                placeholder="EX: CIVIC"
                autoComplete="off"
                className="w-full rounded-xl border border-slate-300 bg-white p-4 uppercase outline-none focus:border-slate-950"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Cor
              </label>

              <input
                value={color}
                onChange={event =>
                  setColor(event.target.value.toUpperCase())
                }
                placeholder="EX: PRETO"
                autoComplete="off"
                className="w-full rounded-xl border border-slate-300 bg-white p-4 uppercase outline-none focus:border-slate-950"
              />
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">
                Horário de entrada
              </div>

              <div className="mt-1 text-lg font-bold">
                Será registrado automaticamente
              </div>
            </div>

            <button
              type="button"
              onClick={registerEntry}
              className="w-full rounded-xl bg-slate-950 p-4 font-bold text-white active:scale-[0.99]"
            >
              Registrar entrada
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

              <div className="rounded-full bg-slate-950 px-3 py-1 text-sm font-bold text-white">
                {parkedVehicles.length}
              </div>
            </div>

            {vehicles.length === 0 && (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                <p className="font-semibold">
                  Nenhum veículo registrado
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Registre a primeira entrada.
                </p>
              </div>
            )}

            {vehicles.map(vehicle => {
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
                          {[vehicle.model, vehicle.color]
                            .filter(Boolean)
                            .join(' • ') || 'SEM DESCRIÇÃO'}
                        </div>
                      </div>

                      {vehicle.exit ? (
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                          FINALIZADO
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
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
                          {formatTime(vehicle.entry)}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-100 p-3">
                        <div className="text-xs text-slate-500">
                          Saída
                        </div>

                        <div className="mt-1 font-bold">
                          {vehicle.exit
                            ? formatTime(vehicle.exit)
                            : '--:--'}
                        </div>
                      </div>
                    </div>

                    {vehicle.exit && calculation && (
                      <div className="space-y-2 border-t border-slate-200 pt-4">
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Permanência
                          </span>

                          <strong>
                            {calculation.duration}
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Proporcional
                          </span>

                          <strong>
                            {money(calculation.proportional)}
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Hora iniciada
                          </span>

                          <strong>
                            {money(calculation.startedHour)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {!vehicle.exit && (
                      <button
                        type="button"
                        onClick={() =>
                          registerExit(vehicle)
                        }
                        className="w-full rounded-xl bg-green-600 p-4 font-bold text-white active:scale-[0.99]"
                      >
                        Registrar saída agora
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        removeVehicle(vehicle.id)
                      }
                      className="w-full rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-600"
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
                Selecione a data que deseja consultar.
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <label className="mb-2 block text-sm font-semibold">
                Data
              </label>

              <input
                type="date"
                value={reportDate}
                onChange={event =>
                  setReportDate(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 p-4 outline-none focus:border-slate-950"
              />
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
                  {formatTotalDuration(totals.minutes)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex justify-between border-b border-slate-100 py-3">
                <span className="text-slate-500">
                  Proporcional
                </span>

                <strong>
                  {money(totals.proportional)}
                </strong>
              </div>

              <div className="flex justify-between py-3">
                <span className="text-slate-500">
                  Hora iniciada
                </span>

                <strong>
                  {money(totals.startedHour)}
                </strong>
              </div>
            </div>

            {reportVehicles.length > 0 ? (
              <div className="space-y-3">
                {reportVehicles.map(vehicle => {
                  const calculation = calculate(
                    vehicle.entry,
                    vehicle.exit,
                  )

                  return (
                    <div
                      key={vehicle.id}
                      className="rounded-2xl bg-white p-4 shadow-sm"
                    >
                      <div className="font-bold">
                        {vehicle.plate}
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        {[vehicle.model, vehicle.color]
                          .filter(Boolean)
                          .join(' • ')}
                      </div>

                      <div className="mt-3 text-sm">
                        {formatTime(vehicle.entry)}
                        {' → '}
                        {formatTime(vehicle.exit)}
                        {' • '}
                        {calculation.duration}
                      </div>

                      <div className="mt-3 flex justify-between text-sm">
                        <span>
                          Proporcional
                        </span>

                        <strong>
                          {money(calculation.proportional)}
                        </strong>
                      </div>

                      <div className="mt-1 flex justify-between text-sm">
                        <span>
                          Hora iniciada
                        </span>

                        <strong>
                          {money(calculation.startedHour)}
                        </strong>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                <p className="font-semibold">
                  Nenhum registro
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Não existem veículos finalizados em {formatDate(reportDate)}.
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
                  className="w-full rounded-xl bg-slate-950 p-4 font-bold text-white active:scale-[0.99]"
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

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-md grid-cols-3">
          <button
            type="button"
            onClick={() => setTab('entry')}
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
            onClick={() => setTab('vehicles')}
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
            onClick={() => setTab('report')}
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
    </div>
  )
            }
