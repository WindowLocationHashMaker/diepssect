const Injector = require('./injector.js')
const Canvas = require('./canvas.js')
const Math = require('./math.js')
const $ = require('./pointer.js')

const CHEAT_MODE = localStorage['actually know javascript'] === 'yes'

const Memory = {
  getArena() {
    let [$arena] = $(0x10a58).$vector
    let arena = $arena ? {
      arenaRight: $arena[0xd8].f32,
      leaderScore: $arena[0x180].f32,
      leaderX: $arena[0x228].f32,
      arenaTop: $arena[0x230].f32,
      arenaBottom: $arena[0x290].f32,
      leaderY: $arena[0x298].f32,
      arenaLeft: $arena[0x2a0].f32,
    } : {
      arenaRight: 0,
      leaderScore: 0,
      leaderX: 0,
      arenaTop: 0,
      arenaBottom: 0,
      leaderY: 0,
      arenaLeft: 0,
    }
    return arena
  },
  getEntityLength() {
    return $(0x10a7c).$vector.length
  },
  getSelfId() {
    let [$ui] = $(0x10a70).$vector
    let selfId = $ui ? $ui[0x1bc].u32 * 0x10000 + $ui[0x1ba].u16 : 0
    return selfId
  },
  getEntities() {
    let entities = $(0x10a7c).$vector.map(($entity, i) => {
      let sizer = $(0x10a28).$vector[i]
      let size = sizer ? sizer[0x38].f32 : null

      let x = $entity[0x28].f32
      let y = $entity[0x48].f32
      let id = $entity.$[0x38].u32 * 0x10000 + $entity.$[0x36].u16

      return { i, x, y, id, size }
    })
    return entities
  },
  scaleZoom(zoom) {
    let [$ui] = $(0x10a70).$vector
    if ($ui)
      $ui[11 * 4].f32 *= zoom
  },
}

const Component = class {
  constructor(parent) {
    this.parent = [parent, ...parent.parent]
  }
  render(c, width, height) {
    console.warn('Component missing render function!', this)
  }
  renderAbsolute(c, x, y, width, height) {
    c.clip(x, y, width, height)
    this.render(c, width, height)
    c.pop()
  }
}

const ComponentTable = class extends Component {
  constructor(parent, horizontal = false, resizable = false) {
    super(parent)

    this.horizontal = horizontal
    this.resizable = resizable
    this.children = []
    this.size = 0
  }
  render(c, width, height) {
    const DIVIDER_SIZE = 5

    let children = this.children.filter(r => !r.hidden)
    if (this.horizontal) {
      this.resize(width)

      if (this.resizable && children.length >= 2) {
        let start = children[0].size
        for (let i = 1; i < children.length; i++) {
          let before = children[i - 1]
          let after = children[i]
          let nextSize = i === children.length - 1
            ? DIVIDER_SIZE
            : Math.min(after.size / 2, DIVIDER_SIZE)
          c.mouse(after.mc, start - DIVIDER_SIZE, 0, DIVIDER_SIZE + nextSize, height)
          start += after.size
          if (after.mc.owned) {
            c.cursor('col-resize')
            if (after.mc.left) {
              let dxBy = Math.constrain(
                i === 1 ? 10 - before.size : -before.size,
                i === children.length - 1 ? after.size - 10 : after.size,
                after.mc.dx)
              before.size += dxBy
              after.size -= dxBy
              after.mc.dx -= dxBy
            } else {
              after.mc.dx = 0
            }
          } else {
            after.mc.dx = 0
          }
        }
      }

      let start = 0
      for (let { size, child } of children) {
        child.renderAbsolute(c, start, 0, size, height)
        start += size
      }
    } else {
      this.resize(height)

      if (this.resizable && children.length >= 2) {
        let start = children[0].size
        for (let i = 1; i < children.length; i++) {
          let before = children[i - 1]
          let after = children[i]
          let nextSize = i === children.length - 1
            ? DIVIDER_SIZE
            : Math.min(after.size / 2, DIVIDER_SIZE)
          c.mouse(after.mc, 0, start - DIVIDER_SIZE, width, DIVIDER_SIZE + nextSize)
          start += after.size
          if (after.mc.owned) {
            c.cursor('row-resize')
            if (after.mc.left) {
              let dyBy = Math.constrain(
                i === 1 ? 10 - before.size : -before.size,
                i === children.length - 1 ? after.size - 10 : after.size,
                after.mc.dy)
              before.size += dyBy
              after.size -= dyBy
              after.mc.dy -= dyBy
            } else {
              after.mc.dy = 0
            }
          } else {
            after.mc.dy = 0
          }
        }
      }

      let start = 0
      for (let { size, child } of children) {
        child.renderAbsolute(c, 0, start, width, size)
        start += size
      }
    }
  }
  createChild(Class, ...args) {
    let child = new Class(this, ...args)
    let size = this.children.length ? Math.floor(this.size / this.children.length) : 1024
    this.children.push({ child, size, hidden: false, mc: Canvas.mc() })
    this.size += size
    return child
  }
  resizeChildren(sizes) {
    let totalSize = 0
    for (let element of this.children) {
      let size = sizes.shift()
      if (size || size === 0) {
        element.size = size
        element.hidden = false
        totalSize += element.size
      } else {
        element.size = 0
        element.hidden = true
      }
    }
    this.size = totalSize
  }
  resize(neededSize) {
    if (this.size === neededSize) return
    let positionOld = 0
    let positionNew = 0
    for (let element of this.children) {
      positionOld += element.size
      let position = Math.round(positionOld / this.size * neededSize)
      element.size = position - positionNew
      positionNew = position
    }
    this.size = neededSize
  }
}

const Scrollable = class extends Component {
  constructor(parent) {
    super(parent)
    this.position = 0
    this.mcBar = Canvas.mc()
    this.mc = Canvas.mc()
  }
  render(c, width, height) {
    const SCROLLBAR_WIDTH = 10
    const SCROLLTHUMB_HEIGHT = 10

    let contentWidth = Math.max(width - SCROLLBAR_WIDTH, 0)
    let contentActualHeight = this.queryHeight(contentWidth)
    let scrollbarWidth = width - contentWidth
    if (contentActualHeight <= height) {
      let smaller = this.queryHeight(width, 0)
      if (smaller <= height) {
        contentWidth = width
        contentActualHeight = smaller
        scrollbarWidth = 0
        this.position = 0
      }
    }

    let sceneY = (contentActualHeight - height) * this.position
    c.clip(0, 0, contentWidth, height)
    c.translate(0, -sceneY)
    this.renderSection(c, contentWidth, Math.max(height, contentActualHeight), sceneY, sceneY + height)
    c.pop()
    c.pop()

    let thumbSize = Math.min(Math.max(SCROLLTHUMB_HEIGHT, height * height / contentActualHeight), height)
    let thumbY = (height - thumbSize) * this.position

    c.mouse(this.mcBar, contentWidth, thumbY, scrollbarWidth, thumbSize)
    c.mouse(this.mc, 0, 0, width, height)
    if (this.mcBar.owned) {
      c.cursor('default')
      if (this.mcBar.left) {
        let delta = this.mcBar.dy / (height - thumbSize)
        this.position += delta
        let actualPosition = Math.constrain(0, 1, this.position)
        this.mcBar.dy = (this.position - actualPosition) * (height - thumbSize)
        this.position = actualPosition
      } else {
        this.mcBar.dy = 0
      }
    } else {
      this.mcBar.dy = 0
    }
    if (this.mc.owned) {
      c.cursor('default')
    }

    let scroll = this.mc.scroll + this.mcBar.scroll
    this.position += scroll / (contentActualHeight - height) * 40
    this.position = Math.constrain(0, 1, this.position)
    this.mc.scroll = 0
    this.mcBar.scroll = 0


    c.fill('#f8f8f8')
    c.rect(contentWidth, 0, scrollbarWidth, height)
    c.fill('#cccccc')
    c.rect(contentWidth, thumbY, scrollbarWidth, thumbSize)
  }
  queryHeight(width) {
    console.warn('Scrollable missing querySize function!', this)
    return 0
  }
  renderSection(c, width, height, minRender, maxRender) {
    console.warn('Scrollable missing renderSection function!', this)
  }
}

const DemoBox = class extends Component {
  constructor(parent) {
    super(parent)
  }
  render(c, width, height) {
    c.fill('#000000')
    c.rect(0, 0, width, height)
    c.fill('#ffffff')
    c.rect(2, 2, width - 4, height - 4)
  }
}

const DemoBoxScrollable = class extends Scrollable {
  constructor(parent) {
    super(parent)
  }
  queryHeight(width) {
    return 400
  }
  renderSection(c, width, height, minRender, maxRender) {
    c.fill('#ff0000')
    c.rect(0, 0, width, 400)
    c.fill('#00ff00')
    c.rect(2, 2, width - 4, 400 - 4)
  }
}

const EntityBox = class extends Component {
  constructor(parent) {
    super(parent)
    this.camera = { x: 0, y: 0, zoom: 0.2 }
    this.mc = Canvas.mc()
  }
  render(c, width, height) {
    c.mouse(this.mc, 0, 0, width, height)
    if (this.mc.owned) {
      if (this.mc.left)
        c.cursor('move')
      else
        c.cursor('default')

      if (this.mc.left || this.mc.scroll !== 0) {
        let zoom = Math.pow(0.85, this.mc.scroll)
        let mx = this.mc.x - width / 2
        let my = this.mc.y - height / 2

        let ax = (this.mc.left ? this.mc.dx / this.camera.zoom : 0) - mx / this.camera.zoom
        let ay = (this.mc.left ? this.mc.dy / this.camera.zoom : 0) - my / this.camera.zoom
        this.camera.zoom = Math.constrain(0.01, 2, this.camera.zoom * zoom)
        this.camera.x += ax + mx / this.camera.zoom
        this.camera.y += ay + my / this.camera.zoom
      }

      this.mc.dx = 0
      this.mc.dy = 0
      this.mc.scroll = 0
    }

    c.fill('#f7f7f7')
    c.rect(0, 0, width, height)

    c.fill('#c4c4c4')

    c.rectLineHorizontal(0, width, this.camera.y * this.camera.zoom + Math.floor(height / 2), 2)
    c.rectLineVertical(this.camera.x * this.camera.zoom + Math.floor(width / 2), 0, height, 2)
    c.translate(Math.floor(width / 2) + this.camera.x * this.camera.zoom, Math.floor(height / 2) + this.camera.y * this.camera.zoom)

    let arena = Memory.getArena()

    let left = arena.arenaLeft * this.camera.zoom
    let right = arena.arenaRight * this.camera.zoom
    let top = arena.arenaTop * this.camera.zoom
    let bottom = arena.arenaBottom * this.camera.zoom

    c.rectLineHorizontal(left, right, top, 2)
    c.rectLineHorizontal(left, right, bottom, 2)
    c.rectLineVertical(left, top, bottom, 2)
    c.rectLineVertical(right, top, bottom, 2)

    c.font(10)
    let selfId = Memory.getSelfId()
    let entities = Memory.getEntities()
    let newestId = entities.map(r => r.id).reduce((a, b) => a > b ? a : b, -1)
    for (let { x, y, id, size } of entities) {
      c.fill(selfId === id ? '#36cf3e' : newestId === id ? '#3636cf' : '#36363e')
      let radius = Math.max(2, Math.min(400, size) * this.camera.zoom)
      c.circle(x * this.camera.zoom, y * this.camera.zoom, radius)
      c.text(`(${ Math.round(x) }, ${ Math.round(y) })`, x * this.camera.zoom + 2 + radius, y * this.camera.zoom)
    }
    if (arena.leaderX !== 0 || arena.leaderY !== 0) {
      c.fill('#ff3202')
      c.circle(arena.leaderX * this.camera.zoom, arena.leaderY * this.camera.zoom, 2)
      c.text(`(${ arena.leaderX.toFixed(4) }, ${ arena.leaderY.toFixed(4) })`, arena.leaderX * this.camera.zoom + 5, arena.leaderY * this.camera.zoom - 12)
    }
    c.pop()
    /*$(0x10a7c).$vector.map(r => {
      if (r[0x48].f32 && r[0x28].f32)
        r[0x48].f32 = r[0x28].f32
    })
    $(0x10a7c).$vector[0].$[0x38].u32 + $(0x10a7c).$vector[0].$[0x36].u16 * 0x100000000
    $(0x10a7c).$vector.map(r => {
      let x = r[0x28].f32
      let y = r[0x48].f32
      let id = r.$[0x38].u32 * 0x10000 + r[0].$[0x36].u16
      return { x, y, id }
    }).reduce((a, b) => a.id > b.id ? a : b)
    */
  }
}

const EntityList = class extends Scrollable {
  constructor(parent) {
    super(parent)
  }
  queryHeight() {
    return Memory.getEntityLength() * 16
  }
  renderSection(c, width, height, minRender, maxRender) {
    c.fill('#f7f7f7')
    c.rect(0, minRender, width, maxRender - minRender)

    c.font(12)
    let selfId = Memory.getSelfId()
    let entities = Memory.getEntities()
    let newestId = entities.map(r => r.id).reduce((a, b) => a > b ? a : b, -1)
    for (let { i, x, y, id, size } of entities) {
      c.fill(selfId === id ? '#36cf3e' : newestId === id ? '#3636cf' : '#36363e')
      c.text(`${ i } - ${ id } - (${ Math.round(x) }, ${ Math.round(y) }) - ${ size }`, 10, 8 + i * 16)
    }
  }
}

/*const CopyImageSource = class extends Component {
  constructor(parent, source) {
    super(parent)
    this.source = source
  }
  renderAbsolute(c, x, y, width, height) {
    if (this.source.width !== width || this.source.height !== height) {
      c.image(this.source, x, y, this.source.width, this.source.height)
      this.source.width = width
      this.source.height = height
    } else {
      c.image(this.source, x, y, width, height)
    }
  }
}*/

const DiepCanvas = class extends Component {
  constructor(parent, mode = 0) {
    // 0 = CSS, 1 = Copy, 2 = Loop Hijack
    super(parent)
    window.onresize = () => {}
    if (mode === 0) {
      /*top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;*/
      window.canvas.style.top = '0'
      window.canvas.style.left = '0'
      window.canvas.style.right = 'auto'
      window.canvas.style.bottom = 'auto'
      window.canvas.style.width = 'auto'
      window.canvas.style.height = 'auto'
    } else {
      window.canvas.style.display = 'none'
    }

    this.mode = mode
    this.disabled = false
    this.mc = Canvas.mc()
  }
  renderAbsolute(c, x, y, width, height) {
    c.mouse(this.mc, x, y, width, height)
    if (window.input)
      if (this.mc.owned) {
        c.cursor(window.canvas.style.cursor)
        input.mouse(this.mc.x - x, this.mc.y - y)
        if (this.mc.left) {
          input.keyDown(1)
        } else {
          input.keyUp(1)
        }
        if (this.mc.right) {
          input.keyDown(3)
        } else {
          input.keyUp(3)
        }

        if (CHEAT_MODE && this.mc.scroll !== 0) {
          let zoom = Math.pow(0.85, this.mc.scroll)
          this.mc.scroll = 0
          Memory.scaleZoom(zoom)
        }
      } else {
        input.keyUp(1)
        input.keyUp(3)
      }

    let source = window.canvas
    if (this.mode === 1) {
      c.image(source, x, y, width, height)
    }
    if (source.width !== width || source.height !== height) {
      source.width = width
      source.height = height
    }
    if (this.mode === 0) {
      window.canvas.style.top = y + 'px'
      window.canvas.style.left = x + 'px'
    } else if (this.mode === 2) {
      if (source.width !== width || source.height !== height) {
        source.width = width
        source.height = height
      }
      const { Browser } = Injector.exports
      if (this.disabled) {
        Browser.mainLoop.runner()
      } else if (Browser.mainLoop.runner) {
        Browser.mainLoop.pause()
        Browser.mainLoop.currentlyRunningMainloop--
        Browser.mainLoop.scheduler = () => {}
        Browser.mainLoop.runner()
        this.disabled = true
      }
      c.image(source, x, y, width, height)
    }
  }
}

const Application = class extends ComponentTable {
  constructor() {
    super({ parent: [] }, true, true)

    this.mc = Canvas.mc()
    this.canvas = this.createCanvas()
    this.diepCanvas = this.createChild(DiepCanvas)
    this.controller = this.createChild(ComponentTable, false, true)
    this.controller.createChild(EntityBox)
    this.controller.createChild(EntityList)
    this.controller.createChild(DemoBox)
    this.controller.resizeChildren([3, 1, 1])
    this.resizeChildren([3, 1])
    this.loop()
    this.canvas.canvas.addEventListener('mousemove', e => {
      this.loop(true)
    }, false)
  }
  createCanvas() {
    let canvas = document.body.appendChild(document.createElement('canvas'))
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.right = '0'
    canvas.style.top = '0'
    canvas.style.bottom = '0'
    canvas.style.height = '100%'
    canvas.style.width = '100%'
    return new Canvas(canvas)
  }
  loop(skip = false) {
    this.canvas.reset(window.innerWidth, window.innerHeight)
    this.render(this.canvas, window.innerWidth, window.innerHeight)
    this.canvas.mouse(this.mc, 0, 0, window.innerWidth, window.innerHeight)
    if (this.mc.owned) {
      this.canvas.cursor('default')
    }
    if (!skip)
      requestAnimationFrame(() => this.loop())
  }
}


console.log(`[DPMA] Injecting...`)
Injector.getExports().then(() => {
  console.log(`[DPMA] Starting!`)
  window.dpma = new Application()
})
