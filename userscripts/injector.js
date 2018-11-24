// ==UserScript==
// @name         Injector
// @namespace    *://diep.io/
// @version      0.2
// @description  A simple script that exports important variables in wasm.js and allows replacing any values such as CanvasRenderingContext2D.prototype.fillText without trigger the extension detector.
// @author       CX
// @run-at      document-start
// @match        *://diep.io/
// @grant        none
// ==/UserScript==

const Injector = window.Injector = window.Injector || (() => {
  let exports = null
  let exportPromise = new Promise(resolve => {
    window.__injectCall = result => {
      exports = result
      resolve(result)
    }
  })

  let appender = `;__injectCall({${
    ['Module', 'cp5', 'Runtime', 'Browser', 'ASM_CONSTS']
      .map(r => 'r: typeof r !== "undefined" && r'.replace(/r/g, r))
      .join(',')
  }})`

  let replaced = []
  let replacedWith = []

  let replace = (object, to) => {
    let { name } = to
    replaced.push(object[name])
    replacedWith.push(to)
    object['_' + name] = object[name]
    object[name] = to
  }

  replace(Function.prototype, function toString() {
    let index = replacedWith.indexOf(this)
    return this._toString.call(index === -1 ? this : replaced[index])
  })

  replace(document, function getElementById(id) {
    if (id !== 'textInput')
      return this._getElementById(id)
    this.getElementById = this._getElementById

    fetch(document.getElementsByTagName('script')[0].src)
      .then(r => r.text())
      .then(r => r.replace(/}\)\)\(window\)\s*$/, to => appender + to))
      .then(eval)

    throw new Error('Disabling default source')
  })

  return {
    get exports() {
      if (!exports)
        throw new Error('Exports are not yet ready!')
      return exports
    },
    getExports() {
      return exportPromise
    },
    replace,
  }
})()
