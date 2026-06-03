interface Props {
  src: string
  alt: string
  size?: number
}

export default function AlbumArt({ src, alt, size = 48 }: Props) {
  return (
    <img
      className="album-art"
      src={src}
      alt={alt}
      width={size}
      height={size}
    />
  )
}
