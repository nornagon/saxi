export class RegexParser extends TransformStream {
  public constructor(opts: { regex: RegExp }) {
    if (opts.regex === undefined) {
      throw new TypeError('"options.regex" must be a regular expression pattern or object')
    }

    if (!(opts.regex instanceof RegExp)) {
      opts.regex = new RegExp(opts.regex)
    }

    const regex = opts.regex
    let data = ''
    const decoder = new TextDecoder()
    super({
      transform(chunk, controller) {
        const newData = data + decoder.decode(chunk)
        const parts = newData.split(regex)
        data = parts.pop()
        parts.forEach(part => {
          controller.enqueue(part)
        })
      },
      flush(controller) {
        controller.enqueue(data)
        data = ''
      }
    })
  }
}
