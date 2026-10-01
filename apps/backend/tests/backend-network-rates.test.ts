import test from 'node:test'
import assert from 'node:assert/strict'
import { createNetworkTrafficSampler, getNetworkBandwidthStats, parseIpLinkCounters, parseNetworkCounters } from '../src/services/network.service.js'
import { getNetworkMetrics, selectNetworkInterface } from '../src/services/system.service.js'

const device = (name: string, rx: number, tx: number) => `${name}:${rx} 1 0 0 0 0 0 0 ${tx} 1 0 0 0 0 0 0\n`
const route = (name: string, metric = 100) => `${name}\t00000000\t0101A8C0\t0003\t0\t0\t${metric}\t00000000\t0\t0\t0\n`

test('dashboard chooses active default eth0 even when down eth1 exists with zero counters', async () => {
  const samples = [
    { name: 'eth1', rxBytes: 0, txBytes: 0, rxBytesPerSec: 0, txBytesPerSec: 0 },
    { name: 'eth0', rxBytes: 20000, txBytes: 40000, rxBytesPerSec: 1000, txBytesPerSec: 2000 },
  ]
  const metrics = await getNetworkMetrics({
    sample: async () => samples,
    read: async path => path === '/proc/net/route' ? route('eth0') : path.includes('/eth0/') ? 'up\n' : 'down\n',
  })
  assert.deepEqual(metrics, { interface: 'eth0', rxBytesPerSec: 1000, txBytesPerSec: 2000, rxTotal: 20000, txTotal: 40000 })
  assert.equal(selectNetworkInterface(['eth1', 'eth0'], null, { eth1: 'down', eth0: 'up' }), 'eth0')
  assert.equal(selectNetworkInterface(['eth1', 'eth0'], route('eth1', 50) + route('eth0'), { eth1: 'down', eth0: 'up' }), 'eth0')
  assert.equal(selectNetworkInterface(['eth1', 'eth0'], route('eth1', 200) + route('eth0', 100), { eth1: 'up', eth0: 'up' }), 'eth0')
  assert.equal(selectNetworkInterface(['eth1', 'eth0'], null, { eth1: 'down', eth0: 'down' }), null)
  assert.equal(selectNetworkInterface(['enp2s0'], route('enp2s0')), 'enp2s0')
})

test('multiple clients share one sampling window instead of consuming each other network rates', async () => {
  let clock = 0
  let reads = 0
  let counters = device('eth0', 100, 200)
  const sample = createNetworkTrafficSampler({ readCounters: async () => { reads++; return counters }, now: () => clock })
  const initial = await sample()
  assert.equal(initial[0]!.rxBytesPerSec, 0)
  clock = 2000; counters = device('eth0', 2100, 4200)
  const rates = await sample()
  assert.equal(rates[0]!.rxBytesPerSec, 1000); assert.equal(rates[0]!.txBytesPerSec, 2000)
  clock = 2001
  const simultaneous = await Promise.all([sample(), sample(), sample()])
  assert.ok(simultaneous.every(value => value[0]!.rxBytesPerSec === 1000 && value[0]!.txBytesPerSec === 2000))
  assert.equal(reads, 2)
  const [dashboard, network] = await Promise.all([getNetworkMetrics({ sample, read: async path => path === '/proc/net/route' ? route('eth0') : 'up' }), getNetworkBandwidthStats(sample)])
  assert.equal(dashboard.rxBytesPerSec, network.interfaces[0]!.rxBytesPerSec)
  assert.equal(dashboard.txBytesPerSec, network.interfaces[0]!.txBytesPerSec)
  assert.equal(reads, 2)
  clock = 4000; counters = device('eth0', 4100, 8200)
  assert.equal((await sample())[0]!.rxBytesPerSec, 1000)
})

test('overlapping asynchronous reads are coalesced; counter reset and interface recreation establish valid baselines', async () => {
  let clock = 0
  let reads = 0
  let counters = device('eth0', 100, 100)
  let release!: () => void
  let blocking: Promise<void> | undefined
  const sample = createNetworkTrafficSampler({ now: () => clock, readCounters: async () => { reads++; await blocking; return counters } })
  await sample()
  clock = 1000; counters = device('eth0', 300, 400)
  blocking = new Promise<void>(resolve => { release = resolve })
  const first = sample(), second = sample()
  release(); const result = await Promise.all([first, second]); blocking = undefined
  assert.equal(reads, 2); assert.equal(result[0][0]!.rxBytesPerSec, 200); assert.deepEqual(result[0], result[1])
  clock = 2000; counters = device('eth0', 10, 20)
  assert.equal((await sample())[0]!.txBytesPerSec, 0)
  clock = 3000; counters = device('eth0', 30, 60)
  assert.equal((await sample())[0]!.txBytesPerSec, 40)
  clock = 4000; counters = ''
  assert.deepEqual(await sample(), [])
  clock = 5000; counters = device('eth0', 100000, 200000)
  assert.equal((await sample())[0]!.rxBytesPerSec, 0)
})

test('kernel counter parsing handles attached values and iproute2 nested stats64 byte counters', () => {
  assert.deepEqual(parseNetworkCounters(device('eth0', 123, 456) + device('eth1', 0, 0) + device('bond0', 20, 40) + device('lo', 99, 99) + device('vethabc', 99, 99)), [
    { name: 'eth0', rxBytes: 123, txBytes: 456 }, { name: 'eth1', rxBytes: 0, txBytes: 0 }, { name: 'bond0', rxBytes: 20, txBytes: 40 },
  ])
  assert.deepEqual(parseNetworkCounters('eth0:broken 1 2 3 4 5 6 7 8\n'), [])
  assert.deepEqual(parseIpLinkCounters({ rx: { bytes: 123 }, tx: { bytes: 456 } }), { rxBytes: 123, txBytes: 456 })
  assert.deepEqual(parseIpLinkCounters({ rx_bytes: 12, tx_bytes: 34 }), { rxBytes: 12, txBytes: 34 })
})

test('a failed proc read clears the previous baseline rather than inventing a rate when reading recovers', async () => {
  let clock = 0
  let fails = false
  let counters = device('eth0', 100, 200)
  const sample = createNetworkTrafficSampler({ now: () => clock, readCounters: async () => { if (fails) throw new Error('unavailable proc fixture'); return counters } })
  await sample()
  clock = 1000; counters = device('eth0', 1100, 2200)
  assert.equal((await sample())[0]!.rxBytesPerSec, 1000)
  clock = 2000; fails = true
  assert.deepEqual(await sample(), [])
  clock = 3000; fails = false; counters = device('eth0', 100000, 200000)
  assert.equal((await sample())[0]!.rxBytesPerSec, 0)
  clock = 4000; counters = device('eth0', 101000, 202000)
  assert.equal((await sample())[0]!.rxBytesPerSec, 1000)
})
