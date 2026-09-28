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

    const request = transaction
      .objectStore(PHOTO_STORE)
      .getAll()

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

    transaction
      .objectStore(PHOTO_STORE)
      .delete(vehicleId)

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

    transaction
      .objectStore(PHOTO_STORE)
      .clear()

    transaction.oncomplete = () => {
      resolve()
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }
  })
}

async function getCurrentUser() {
  const session =
    await neon.auth.getSession()

  return session?.data?.user || null
}

export async function ensureCurrentProfile() {
  const user =
    await getCurrentUser()

  if (!user?.id) {
    return null
  }

  const name =
    user.name?.trim() ||
    user.email
      ?.split('@')[0]
      ?.toUpperCase() ||
    'USUÁRIO'

  const {
    data,
    error,
  } = await neon
    .from('profiles')
    .upsert(
      {
        id: user.id,
        name,
        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict: 'id',
      },
    )
    .select()
    .single()

  if (error) {
    console.error(
      'Erro ao salvar perfil:',
      error,
    )

    throw new Error(
      error.message ||
        'Não foi possível salvar o perfil.',
    )
  }

  return data
}

function mapVehicle(
  row,
  photo,
  profiles,
) {
  return {
    id:
      row.id,

    plate:
      row.plate,

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

    exitBy:
      row.exit_by || null,

    createdByName:
      profiles.get(
        row.created_by,
      ) || null,

    updatedByName:
      profiles.get(
        row.updated_by,
      ) || null,

    exitByName:
      profiles.get(
        row.exit_by,
      ) || null,

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
    vehicleResult,
    profileResult,
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

    neon
      .from('profiles')
      .select('id,name'),

    getAllPhotos(),
  ])

  if (vehicleResult.error) {
    console.error(
      'Erro ao buscar veículos:',
      vehicleResult.error,
    )

    throw new Error(
      vehicleResult.error.message ||
        'Não foi possível carregar os veículos.',
    )
  }

  let profiles = []

  if (profileResult.error) {
    console.error(
      'Erro ao buscar perfis:',
      profileResult.error,
    )
  } else {
    profiles =
      profileResult.data || []
  }

  const photoMap =
    new Map(
      localPhotos.map(item => [
        item.vehicleId,
        item.photo,
      ]),
    )

  const profileMap =
    new Map(
      profiles.map(profile => [
        profile.id,
        profile.name,
      ]),
    )

  return (
    vehicleResult.data || []
  ).map(row =>
    mapVehicle(
      row,
      photoMap.get(row.id),
      profileMap,
    ),
  )
}

export async function saveVehicle(
  vehicle,
) {
  try {
    await ensureCurrentProfile()
  } catch (error) {
    console.error(
      'Não foi possível atualizar o perfil:',
      error,
    )
  }

  const user =
    await getCurrentUser()

  const userId =
    user?.id || null

  let exitBy = null

  if (vehicle.exit) {
    exitBy =
      vehicle.exitBy ||
      userId
  }

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
      vehicle.exit ||
      null,

    exit_by:
      exitBy,

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

export async function registerVehicleExit(
  vehicle,
  exitDate,
) {
  try {
    await ensureCurrentProfile()
  } catch (error) {
    console.error(
      'Não foi possível atualizar o perfil:',
      error,
    )
  }

  const user =
    await getCurrentUser()

  const userId =
    user?.id || null

  if (!userId) {
    throw new Error(
      'Usuário não autenticado.',
    )
  }

  const exit =
    exitDate instanceof Date
      ? exitDate.toISOString()
      : exitDate

  const {
    error,
  } = await neon
    .from('vehicles')
    .update({
      exit,
      exit_by:
        vehicle.exitBy ||
        userId,
      updated_by:
        userId,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      'id',
      vehicle.id,
    )

  if (error) {
    console.error(
      'Erro ao registrar saída:',
      error,
    )

    throw new Error(
      error.message ||
        'Não foi possível registrar a saída.',
    )
  }
}

export async function removeVehicleExit(
  vehicle,
) {
  try {
    await ensureCurrentProfile()
  } catch (error) {
    console.error(
      'Não foi possível atualizar o perfil:',
      error,
    )
  }

  const user =
    await getCurrentUser()

  const userId =
    user?.id || null

  const {
    error,
  } = await neon
    .from('vehicles')
    .update({
      exit: null,
      exit_by: null,
      updated_by:
        userId,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      'id',
      vehicle.id,
    )

  if (error) {
    console.error(
      'Erro ao remover saída:',
      error,
    )

    throw new Error(
      error.message ||
        'Não foi possível remover a saída.',
    )
  }
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

  const ids =
    (data || []).map(
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
