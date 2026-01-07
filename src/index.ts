import { Minipass } from 'minipass'

const isBufferEncoding = (enc: unknown): enc is BufferEncoding =>
  typeof enc === 'string'

export class SizeError extends Error {
  expect: number
  found: number
  code: 'EBADSIZE' = 'EBADSIZE'
  constructor(found: number, expect: number, from?: (...a: any[]) => any) {
    super(`Bad data size: expected ${expect} bytes, but got ${found}`)
    this.expect = expect
    this.found = found
    Error.captureStackTrace(this, from ?? this.constructor)
  }
  get name() {
    return 'SizeError'
  }
}

export type Options<T extends Minipass.BufferOrString> =
  Minipass.Options<T> & {
    objectMode?: false
    size: number
  }

export class MinipassSized<
  RType extends Minipass.BufferOrString,
  WType extends Minipass.BufferOrString,
  Events extends Minipass.Events<RType> = Minipass.Events<RType>,
> extends Minipass<RType, WType, Events> {
  found: number = 0
  expect: number

  constructor(options: Options<RType>) {
    const size = options?.size
    if (
      typeof size !== 'number' ||
      size > Number.MAX_SAFE_INTEGER ||
      isNaN(size) ||
      size < 0 ||
      !isFinite(size) ||
      size !== Math.floor(size)
    ) {
      throw new Error('invalid expected size: ' + size)
    }

    //@ts-ignore
    super(options)

    if (options.objectMode) {
      throw new TypeError(
        `${
          this.constructor.name
        } streams only work with string and buffer data`,
      )
    }

    this.expect = size
  }

  write(chunk: WType, cb?: () => void): boolean
  write(
    chunk: WType,
    encoding?: Minipass.Encoding,
    cb?: () => void,
  ): boolean
  write(
    chunk: WType,
    encoding?: Minipass.Encoding | (() => void),
    cb?: () => void,
  ): boolean {
    const buffer =
      Buffer.isBuffer(chunk) ? chunk
      : typeof chunk === 'string' ?
        Buffer.from(chunk, isBufferEncoding(encoding) ? encoding : 'utf8')
      : chunk

    if (typeof encoding === 'function') {
      cb = encoding
      encoding = null
    }

    if (!Buffer.isBuffer(buffer)) {
      this.emit(
        'error',
        new TypeError(
          `${
            this.constructor.name
          } streams only work with string and buffer data`,
        ),
      )
      return false
    }

    this.found += buffer.length
    if (this.found > this.expect)
      this.emit('error', new SizeError(this.found, this.expect))

    return super.write(chunk, encoding, cb)
  }

  emit<Event extends keyof Events>(
    ev: Event,
    ...args: Events[Event]
  ): boolean {
    if (ev === 'end') {
      if (this.found !== this.expect) {
        this.emit(
          'error',
          new SizeError(this.found, this.expect, this.emit),
        )
      }
    }
    return super.emit(ev, ...args)
  }
}
