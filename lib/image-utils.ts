/**
 * Comprime qualquer imagem enviada pelo usuário para no máximo 150x150px
 * (quadrado, object-fit: cover) em image/jpeg qualidade 0.6, ANTES de
 * salvar no estado — evita estourar o limite de ~5MB do localStorage.
 */
export function compressImage(file: File, size = 150): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas 2D indisponível')

        // object-fit: cover — recorta o centro
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)

        resolve(canvas.toDataURL('image/jpeg', 0.6))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Falha ao carregar imagem'))
    }
    img.src = url
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao carregar imagem'))
    img.src = src
  })
}
