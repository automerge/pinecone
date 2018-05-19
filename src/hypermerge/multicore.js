const { EventEmitter } = require('events')
const HypercoreProtocol = require('hypercore-protocol')
const HypercoreArchiver = require('hypercore-archiver')
const Hypercore = require('hypercore')
const crypto = require('hypercore/lib/crypto')
const thunky = require('thunky')
const toBuffer = require('to-buffer')

class Multicore extends EventEmitter {
  constructor(storage, opts) {
    super()
    opts = opts || {}
    this.archiver = new HypercoreArchiver(storage)
    this.ready = thunky(open)
    const self = this

    function open(cb) {
      self.opened = true
      self.archiver.on('ready', () => {
        self.emit('ready')
        cb()
      })
    }
  }

  createFeed(key, opts) {
    if (!this.opened) {
      throw new Error('multicore not ready, use .ready()')
    }
    const archiver = this.archiver
    opts = opts || {}
    if (!key) {
      // create key pair
      const keyPair = crypto.keyPair()
      key = keyPair.publicKey
      opts.secretKey = keyPair.secretKey
    }
    const dk = Hypercore.discoveryKey(toBuffer(key, 'hex')).toString('hex')

    if (archiver.feeds[dk]) {
      return archiver.feeds[dk]
    }

    opts.sparse = archiver.sparse
    const feed = Hypercore(storage(key), key, opts)
    archiver.feeds[dk] = feed

    archiver.changes.append({ type: 'add', key: key.toString('hex') })
    archiver.emit('add', feed)

    return feed

    function storage(key) {
      const dk = Hypercore.discoveryKey(key).toString('hex')
      const prefix = `${dk.slice(0, 2)}/${dk.slice(2, 4)}/${dk.slice(4)}/`

      return (name) => archiver.storage.feeds(prefix + name)
    }
  }

  replicate(opts) {
    if (!opts) {
      opts = {}
    }

    if (opts.discoveryKey) {
      opts.discoveryKey = toBuffer(opts.discoveryKey, 'hex')
    }

    if (opts.key) {
      opts.discoveryKey = Hypercore.discoveryKey(toBuffer(opts.key, 'hex'))
    }

    const { archiver } = this

    const stream = HypercoreProtocol({
      live: true,
      id: archiver.changes.id,
      encrypt: opts.encrypt,
      extensions: ['hypermerge']
    })

    stream.on('feed', add)
    if (opts.channel || opts.discoveryKey) {
      add(opts.channel || opts.discoveryKey)
    }

    function add(dk) {
      archiver.ready((err) => {
        if (err) {
          stream.destroy(err)
          return
        }

        if (stream.destroyed) {
          return
        }

        const hex = dk.toString('hex')
        const changesHex = archiver.changes.discoveryKey.toString('hex')

        const archive = archiver.archives[hex]
        if (archive) {
          onarchive()
          return
        }

        const feed = changesHex === hex ? archiver.changes : archiver.feeds[hex]
        if (feed) {
          onfeed()
        }

        function onarchive() {
          archive.metadata.replicate({
            stream,
            live: true
          })
          archive.content.replicate({
            stream,
            live: true
          })
        }

        function onfeed() {
          if (stream.destroyed) {
            return
          }

          stream.on('close', onclose)
          stream.on('end', onclose)

          feed.on('_archive', onarchive)
          feed.replicate({
            stream,
            live: true
          })

          function onclose() {
            feed.removeListener('_archive', onarchive)
          }

          function onarchive() {
            if (stream.destroyed) {
              return
            }

            const { content } = archiver.archives[hex]
            content.replicate({
              stream,
              live: true
            })
          }
        }
      })
    }

    return stream
  }
}

module.exports = Multicore
