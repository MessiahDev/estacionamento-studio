import { neon } from './neon'

const PHOTO_DB = 'parking-photos'
const PHOTO_STORE = 'photos'
const PHOTO_VERSION = 1

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      PHOTO_DB,
      PHOTO_VERSION,
    )

    request.onupgradeneeded = () => {
      const db = request.result

      if (
        !db.objectStoreNames.contains(
          PHOTO_STORE,
        )
      ) {
        db.createObjectStore(
          PHOTO_STORE,
          {
            keyPath: 'vehicleId',
          },
        )
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function getAllPhotos() {
  const db = await openPhotoDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      PHOTO_STORE,
      'readonly',
    )

    const store =
      transaction.objectStore(
        PHOTO_STORE,
      )

    const request = store.getAll()

    request.onsuccess = () => {
      resolve(request.result || [])
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function savePhoto(
  vehicleId,
  photo,
) {
  const db = await openPhotoDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      PHOTO_STORE,
      'readwrite',
    )

    const store =
      transaction.objectStore(
        PHOTO_STORE,
      )

    if (photo) {
      store.put({
        vehicleId,
        photo,
      })
    } else {
      store.delete(vehicleId)
    }

    transaction.oncomplete = () => {
      resolve()
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

async function deletePhoto(vehicleId) {
  const db = await openPhotoDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      PHOTO_STORE,
      'readwrite',
    )

    const store =
      transaction.objectStore(
        PHOTO_STORE,
      )

    store.delete(vehicleId)

    transaction.oncomplete = () => {
      resolve()
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

async function clearPhotos() {
  const db = await openPhotoDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      PHOTO_STORE,
      'readwrite',
    )

    const store =
      transaction.objectStore(
        PHOTO_STORE,
      )

    store.clear()

    transaction.oncomplete = () => {
      resolve()
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

function mapVehicle(
  row,
  photo,
) {
  return {
    id: row.id,

    plate: row.plate,

    model:
      row.model || '',

    color:
      row.color || '',

    entry:
      row.entry,

    exit:
      row.exit,

    createdBy:
      row.created_by || null,

    updatedBy:
      row.updated_by || null,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    photo:
      photo || null,
  }
}

export async function getVehicles() {
  const [
    databaseResult,
    localPhotos,
  ] = await Promise.all([
    neon
      .from('vehicles')
      .select('*')
      .order(
        'entry',
        {
          ascending: false,
        },
      ),

    getAllPhotos(),
  ])

  const {
    data,
    error,
  } = databaseResult

  if (error) {
    console.error(
      'Erro ao buscar veículos:',
      error,
    )

    throw new Error(
      error.message ||
        'Não foi possível carregar os veículos.',
    )
  }

  const photoMap = new Map(
    localPhotos.map(item => [
      item.vehicleId,
      item.photo,
    ]),
  )

  return (data || []).map(row => {
    return mapVehicle(
      row,
      photoMap.get(row.id),
    )
  })
}

export async function saveVehicle(
  vehicle,
) {
  const session =
    await neon.auth.getSession()

  const userId =
    session?.data?.user?.id ||
    null

  const payload = {
    id:
      vehicle.id,

    plate:
      vehicle.plate
        .trim()
        .toUpperCase(),

    model:
      vehicle.model
        ?.trim()
        .toUpperCase() ||
      null,

    color:
      vehicle.color
        ?.trim()
        .toUpperCase() ||
      null,

    entry:
      vehicle.entry,

    exit:
      vehicle.exit || null,

    updated_by:
      userId,

    updated_at:
      new Date().toISOString(),
  }

  const {
    error,
  } = await neon
    .from('vehicles')
    .upsert(
      payload,
      {
        onConflict: 'id',
      },
    )

  if (error) {
    console.error(
      'Erro ao salvar veículo:',
      error,
    )

    throw new Error(
      error.message ||
        'Não foi possível salvar o veículo.',
    )
  }

  await savePhoto(
    vehicle.id,
    vehicle.photo || null,
  )
}

export async function deleteVehicle(
  id,
) {
  const {
    error,
  } = await neon
    .from('vehicles')
    .delete()
    .eq(
      'id',
      id,
    )

  if (error) {
    console.error(
      'Erro ao excluir veículo:',
      error,
    )

    throw new Error(
      error.message ||
        'Não foi possível excluir o veículo.',
    )
  }

  await deletePhoto(id)
}

export async function clearVehicles() {
  const {
    data,
    error,
  } = await neon
    .from('vehicles')
    .select('id')

  if (error) {
    console.error(
      'Erro ao listar veículos:',
      error,
    )

    throw new Error(
      error.message ||
        'Não foi possível limpar os veículos.',
    )
  }

  const ids = (data || []).map(
    item => item.id,
  )

  if (ids.length > 0) {
    const {
      error: deleteError,
    } = await neon
      .from('vehicles')
      .delete()
      .in(
        'id',
        ids,
      )

    if (deleteError) {
      console.error(
        'Erro ao limpar veículos:',
        deleteError,
      )

      throw new Error(
        deleteError.message ||
          'Não foi possível limpar os veículos.',
      )
    }
  }

  await clearPhotos()
}
