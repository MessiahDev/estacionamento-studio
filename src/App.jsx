import { useEffect, useMemo, useState } from "react";
import { deleteVehicle, getVehicles, saveVehicle } from "./db";

const RATE = 2;

function money(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function calculate(entry, exit) {
  if (!entry || !exit) return null;

  const minutes = Math.max(
    0,
    Math.round((new Date(exit) - new Date(entry)) / 60000)
  );

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  const duration =
    hours > 0
      ? `${hours}h${rest ? String(rest).padStart(2, "0") : ""}`
      : `${minutes}min`;

  return {
    minutes,
    duration,
    proportional: (minutes / 60) * RATE,
    startedHour: minutes > 0 ? Math.ceil(minutes / 60) * RATE : 0
  };
}

export default function App() {
  const [vehicles, setVehicles] = useState([]);
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [photo, setPhoto] = useState(null);
  const [tab, setTab] = useState("vehicles");

  async function load() {
    setVehicles(await getVehicles());
  }

  useEffect(() => {
    load();
  }, []);

  async function registerEntry() {
    if (!plate.trim()) return;

    const vehicle = {
      id: crypto.randomUUID(),
      plate: plate.toUpperCase().trim(),
      model: model.trim(),
      photo,
      entry: new Date().toISOString(),
      exit: null
    };

    await saveVehicle(vehicle);

    setPlate("");
    setModel("");
    setPhoto(null);

    await load();
    setTab("vehicles");
  }

  async function registerExit(vehicle) {
    await saveVehicle({
      ...vehicle,
      exit: new Date().toISOString()
    });

    await load();
  }

  async function remove(id) {
    await deleteVehicle(id);
    await load();
  }

  const finished = vehicles.filter(v => v.exit);

  const totals = useMemo(() => {
    return finished.reduce(
      (acc, vehicle) => {
        const calc = calculate(vehicle.entry, vehicle.exit);

        acc.minutes += calc.minutes;
        acc.proportional += calc.proportional;
        acc.startedHour += calc.startedHour;

        return acc;
      },
      {
        minutes: 0,
        proportional: 0,
        startedHour: 0
      }
    );
  }, [finished]);

  function report() {
    const lines = finished.map(vehicle => {
      const calc = calculate(vehicle.entry, vehicle.exit);

      return `${vehicle.plate}${vehicle.model ? ` - ${vehicle.model}` : ""} | ${formatTime(vehicle.entry)} às ${formatTime(vehicle.exit)} | ${calc.duration} | Proporcional: ${money(calc.proportional)} | Hora iniciada: ${money(calc.startedHour)}`;
    });

    const hours = Math.floor(totals.minutes / 60);
    const minutes = totals.minutes % 60;

    return [
      `Resumo dos veículos — ${money(RATE)}/h`,
      "",
      ...lines,
      "",
      `Tempo total: ${hours}h${String(minutes).padStart(2, "0")}`,
      `Total proporcional: ${money(totals.proportional)}`,
      `Total por hora iniciada: ${money(totals.startedHour)}`
    ].join("\n");
  }

  async function copyReport() {
    await navigator.clipboard.writeText(report());
    alert("Relatório copiado.");
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="bg-slate-950 px-5 py-5 text-white">
        <h1 className="text-xl font-bold">Controle de Veículos</h1>
        <p className="mt-1 text-sm text-slate-400">
          Tarifa: {money(RATE)} por hora
        </p>
      </header>

      <main className="mx-auto max-w-md p-4">
        {tab === "entry" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Nova entrada</h2>

            <label className="block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white">
              {photo ? (
                <img
                  src={URL.createObjectURL(photo)}
                  className="h-52 w-full object-cover"
                />
              ) : (
                <div className="flex h-44 items-center justify-center text-slate-500">
                  Tirar foto do veículo
                </div>
              )}

              <input
                hidden
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => setPhoto(e.target.files?.[0] || null)}
              />
            </label>

            <input
              value={plate}
              onChange={e => setPlate(e.target.value)}
              placeholder="Placa"
              className="w-full rounded-xl border border-slate-300 bg-white p-4 text-lg uppercase outline-none"
            />

            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="Modelo / descrição"
              className="w-full rounded-xl border border-slate-300 bg-white p-4 outline-none"
            />

            <button
              onClick={registerEntry}
              className="w-full rounded-xl bg-slate-950 p-4 font-semibold text-white"
            >
              Registrar entrada agora
            </button>
          </div>
        )}

        {tab === "vehicles" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Veículos</h2>

              <span className="text-sm text-slate-500">
                {vehicles.filter(v => !v.exit).length} estacionados
              </span>
            </div>

            {vehicles
              .slice()
              .reverse()
              .map(vehicle => {
                const calc = calculate(vehicle.entry, vehicle.exit);
                const photoUrl = vehicle.photo
                  ? URL.createObjectURL(vehicle.photo)
                  : null;

                return (
                  <div
                    key={vehicle.id}
                    className="overflow-hidden rounded-2xl bg-white shadow-sm"
                  >
                    {photoUrl && (
                      <img
                        src={photoUrl}
                        className="h-44 w-full object-cover"
                      />
                    )}

                    <div className="space-y-3 p-4">
                      <div>
                        <div className="text-lg font-bold">
                          {vehicle.plate}
                        </div>

                        {vehicle.model && (
                          <div className="text-sm text-slate-500">
                            {vehicle.model}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between text-sm">
                        <span>Entrada</span>
                        <strong>{formatTime(vehicle.entry)}</strong>
                      </div>

                      {vehicle.exit && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span>Saída</span>
                            <strong>{formatTime(vehicle.exit)}</strong>
                          </div>

                          <div className="border-t pt-3">
                            <div className="flex justify-between">
                              <span>Tempo</span>
                              <strong>{calc.duration}</strong>
                            </div>

                            <div className="mt-2 flex justify-between">
                              <span>Proporcional</span>
                              <strong>
                                {money(calc.proportional)}
                              </strong>
                            </div>

                            <div className="mt-2 flex justify-between">
                              <span>Hora iniciada</span>
                              <strong>
                                {money(calc.startedHour)}
                              </strong>
                            </div>
                          </div>
                        </>
                      )}

                      {!vehicle.exit && (
                        <button
                          onClick={() => registerExit(vehicle)}
                          className="w-full rounded-xl bg-green-600 p-3 font-semibold text-white"
                        >
                          Registrar saída
                        </button>
                      )}

                      <button
                        onClick={() => remove(vehicle.id)}
                        className="w-full rounded-xl bg-slate-100 p-3 text-sm"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {tab === "report" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Relatório</h2>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex justify-between py-2">
                <span>Veículos</span>
                <strong>{finished.length}</strong>
              </div>

              <div className="flex justify-between py-2">
                <span>Proporcional</span>
                <strong>{money(totals.proportional)}</strong>
              </div>

              <div className="flex justify-between py-2">
                <span>Hora iniciada</span>
                <strong>{money(totals.startedHour)}</strong>
              </div>
            </div>

            <pre className="whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm shadow-sm">
              {report()}
            </pre>

            <button
              onClick={copyReport}
              className="w-full rounded-xl bg-slate-950 p-4 font-semibold text-white"
            >
              Copiar relatório
            </button>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t bg-white">
        <div className="mx-auto grid max-w-md grid-cols-3">
          <button
            onClick={() => setTab("entry")}
            className="p-4 text-sm font-semibold"
          >
            Entrada
          </button>

          <button
            onClick={() => setTab("vehicles")}
            className="p-4 text-sm font-semibold"
          >
            Veículos
          </button>

          <button
            onClick={() => setTab("report")}
            className="p-4 text-sm font-semibold"
          >
            Relatório
          </button>
        </div>
      </nav>
    </div>
  );
}
