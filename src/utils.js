export function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatTime(date) {
  if (!date) return '--:--'

  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatFullDate(date) {
  if (!date) return ''

  return new Date(date).toLocaleDateString('pt-BR')
}

export function getDateKey(date) {
  const value = new Date(date)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function today() {
  return getDateKey(new Date())
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00`)

  value.setDate(value.getDate() + days)

  return getDateKey(value)
}

export function formatDateKey(date) {
  if (!date) return ''

  const [year, month, day] = date.split('-')

  return `${day}/${month}/${year}`
}

export function toDateTimeLocal(iso) {
  if (!iso) return ''

  const date = new Date(iso)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function nowDateTimeLocal() {
  return toDateTimeLocal(new Date().toISOString())
}

export function calculate(entry, exit, rate = 2) {
  if (!entry || !exit) return null

  const start = new Date(entry)
  const end = new Date(exit)

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return null
  }

  const minutes = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 60000),
  )

  return {
    minutes,
    duration: formatDuration(minutes),
    proportional: (minutes / 60) * rate,
    startedHour: minutes > 0 ? Math.ceil(minutes / 60) * rate : 0,
  }
}

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60

  if (hours && remaining) {
    return `${hours}h${String(remaining).padStart(2, '0')}min`
  }

  if (hours) return `${hours}h`

  return `${remaining}min`
}

export function compressImage(file, maxSize = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null)
      return
    }

    const reader = new FileReader()

    reader.onload = event => {
      const image = new Image()

      image.onload = () => {
        let width = image.width
        let height = image.height

        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(
            maxSize / width,
            maxSize / height,
          )

          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')

        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d')

        context.drawImage(image, 0, 0, width, height)

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Erro ao comprimir imagem'))
              return
            }

            resolve(blob)
          },
          'image/jpeg',
          quality,
        )
      }

      image.onerror = reject
      image.src = event.target.result
    }

    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      resolve(null)
      return
    }

    const reader = new FileReader()

    reader.onload = () => resolve(reader.result)
    reader.onerror = reject

    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null

  const response = await fetch(dataUrl)

  return response.blob()
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename

  document.body.appendChild(anchor)

  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(url)
}

export function escapeCsv(value) {
  const text = String(value ?? '')

  return `"${text.replaceAll('"', '""')}"`
}
