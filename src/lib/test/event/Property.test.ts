/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect, { mock } from "tstl-expect"
import { _numObservers, multiMap, MutableProperty, Property, property, Props } from "../../event"

describe("property", () => {
  let s: MutableProperty<string>
  before_each(() => {
    s = property("begin")
  })

  it("can be constructed with initial value", () => {
    expect(s.get()).toBe("begin")
  })

  it("can be set", () => {
    s.set("end")
    expect(s.get()).toBe("end")
  })

  test("subscribeAndFire", () => {
    const fn = mock.fn()
    s._subscribeIndependentlyAndRaise({ invoke: fn })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("begin", nil)
  })

  it("notifies subscribers of value when value changed", () => {
    const fn = mock.fn()
    s._subscribeIndependently({ invoke: fn })
    s.set("end")
    expect(fn).toHaveBeenCalledWith("end", "begin")
  })

  test("truthy", () => {
    const val = property(false)
    const res = val.truthy()

    const fn = mock.fn()
    res._subscribeIndependentlyAndRaise({ invoke: fn })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(false, nil)
    val.set(true)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(true, false)
  })
})

describe("State utils", () => {
  test("setValueFn", () => {
    const s = property("begin")
    const fn = Props.setValueFn(s, "end")
    expect(s.get()).toBe("begin")
    fn.invoke()
    expect(s.get()).toBe("end")
  })

  test("toggleFn", () => {
    const s = property(false)
    const fn = Props.toggleFn(s)
    expect(s.get()).toBe(false)
    fn.invoke()
    expect(s.get()).toBe(true)
    fn.invoke()
    expect(s.get()).toBe(false)
  })
})

describe("map", () => {
  let val: MutableProperty<number>
  let mapped: Property<number>
  before_each(() => {
    val = property(3)
    mapped = val.map({ invoke: (x) => x * 2 })
  })
  test("gives correct value for get()", () => {
    expect(mapped.get()).toEqual(6)
    val.set(4)
    expect(mapped.get()).toEqual(8)
  })

  test("gives correct values to observers", () => {
    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(6, nil)

    val.set(4)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(8, 6)
  })

  test("closes subscriptions when all observers are removed", () => {
    const sub = mapped._subscribeIndependently({
      invoke: () => 0,
    })
    expect(_numObservers(val)).toEqual(1)

    sub.close()
    // val.forceNotify()

    expect(_numObservers(val)).toEqual(0)
  })
})

describe("multiMap", () => {
  let val1: MutableProperty<number>
  let val2: MutableProperty<number>
  let mapped: Property<number>
  before_each(() => {
    val1 = property(3)
    val2 = property(4)
    mapped = multiMap({ invoke: (x: number, y: number, z: number) => x + y + z }, val1, val2, property(1))
  })
  test("gives correct value for get()", () => {
    expect(mapped.get()).toEqual(8)
    val2.set(5)
    expect(mapped.get()).toEqual(9)
    val1.set(4)
    expect(mapped.get()).toEqual(10)
  })
  test("gives correct values to observers", () => {
    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(8, nil)

    val1.set(4)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(9, 8)

    val2.set(5)

    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn).toHaveBeenCalledWith(10, 9)
  })
  test("closes subscriptions when all observers are removed", () => {
    const sub = mapped._subscribeIndependently({
      invoke: () => 0,
    })
    expect(_numObservers(val1)).toEqual(1)
    expect(_numObservers(val2)).toEqual(1)

    sub.close()

    expect(_numObservers(val1)).toEqual(0)
    expect(_numObservers(val2)).toEqual(0)
  })
})

describe("flatMap", () => {
  test("maps non-state values", () => {
    const val = property(3)
    const mapped = val.flatMap({ invoke: (x) => x * 2 })
    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(6, nil)

    val.set(4)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(8, 6)
  })

  test("maps state values", () => {
    const val = property(3)
    const mapped = val.flatMap({ invoke: (x) => property(x * 2) })
    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(6, nil)

    val.set(4)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(8, 6)
  })

  test("listens to inner state and unsubscribes when changed", () => {
    const val = property(1)
    const innerVal = property(4)
    const mapped = val.flatMap({ invoke: (x) => (x == 1 ? innerVal : x) })

    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(4, nil)

    innerVal.set(5)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(5, 4)

    val.set(2)

    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn).toHaveBeenCalledWith(2, 5)
    expect(_numObservers(innerVal)).toBe(0)

    val.set(1)

    expect(fn).toHaveBeenCalledTimes(4)
    expect(fn).toHaveBeenCalledWith(5, 2)
  })

  test("closes subscriptions when all observers are removed", () => {
    const val = property(1)
    const innerVal = property(4)
    const mapped = val.flatMap({ invoke: (x) => (x == 1 ? innerVal : x) })

    const sub = mapped._subscribeIndependently({
      invoke: () => 0,
    })
    expect(_numObservers(val)).toEqual(1)
    expect(_numObservers(innerVal)).toEqual(1)

    sub.close()

    expect(_numObservers(val)).toEqual(0)
    expect(_numObservers(innerVal)).toEqual(0)
  })

  test("gives correct value for get()", () => {
    const val = property(3)
    const mapped = val.flatMap({ invoke: (x) => property(x * 2) })
    expect(mapped.get()).toEqual(6)

    val.set(4)

    expect(mapped.get()).toEqual(8)
  })
})
