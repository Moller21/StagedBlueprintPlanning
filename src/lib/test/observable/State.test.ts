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

import { MutableState, State, state } from "../../observable"

function spy() {
  return globalThis.spy<(this: any) => void>()
}

describe("state", () => {
  let s: MutableState<string>
  before_each(() => {
    s = state("begin")
  })

  it("can be constructed with initial value", () => {
    assert.equal(s.get(), "begin")
  })

  it("can be set", () => {
    s.set("end")
    assert.equal(s.get(), "end")
  })

  test("subscribeAndFire", () => {
    const fn = spy()
    s.subscribeIndependentlyAndFire({ invoke: fn })
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, "begin", nil)
  })

  it("notifies subscribers of value when value changed", () => {
    const fn = spy()
    s.subscribeIndependently({ invoke: fn })
    s.set("end")
    assert.spy(fn).called_with(match._, "end", "begin")
  })

  test("setValueFn", () => {
    const fn = s.setValueFn("end")
    assert.equal(s.get(), "begin")
    fn.invoke()
    assert.equal(s.get(), "end")
  })
})

describe("map", () => {
  test("maps correct values to observers", () => {
    const val = state(3)
    const mapped = val.map({ invoke: (x) => x * 2 })
    const fn = spy()
    mapped.subscribeIndependentlyAndFire({ invoke: fn })

    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, 6, nil)

    val.set(4)

    assert.spy(fn).called(2)
    assert.spy(fn).called_with(match._, 8, 6)
  })

  test("gives correct value for get()", () => {
    const val = state(3)
    const mapped = val.map({ invoke: (x) => x * 2 })
    assert.same(6, mapped.get())
  })

  test("choice", () => {
    const val = state(false)
    const choice = val.switch("yes", "no")

    const fn = spy()
    choice.subscribeIndependentlyAndFire({ invoke: fn })
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, "no", nil)
    val.set(true)
    assert.spy(fn).called(2)
    assert.spy(fn).called_with(match._, "yes", "no")
  })
})

describe("flatMap", () => {
  test("maps non-state values", () => {
    const val = state(3)
    const mapped = val.flatMap({ invoke: (x) => x * 2 })
    const fn = spy()
    mapped.subscribeIndependentlyAndFire({ invoke: fn })

    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, 6, nil)

    val.set(4)

    assert.spy(fn).called(2)
    assert.spy(fn).called_with(match._, 8, 6)
  })

  test("maps state values", () => {
    const val = state(3)
    const mapped = val.flatMap({ invoke: (x) => state(x * 2) })
    const fn = spy()
    mapped.subscribeIndependentlyAndFire({ invoke: fn })

    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, 6, nil)

    val.set(4)

    assert.spy(fn).called(2)
    assert.spy(fn).called_with(match._, 8, 6)
  })

  test("listens to inner state and unsubscribes", () => {
    const val = state(1)
    const innerVal = state(4)
    const mapped = val.flatMap({ invoke: (x) => (x == 1 ? innerVal : x) })

    const fn = spy()
    mapped.subscribeIndependentlyAndFire({ invoke: fn })

    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, 4, nil)

    innerVal.set(5)
    assert.spy(fn).called(2)
    assert.spy(fn).called_with(match._, 5, 4)

    val.set(2)

    assert.spy(fn).called(3)
    assert.spy(fn).called_with(match._, 2, 5)
    assert.equal(0, State._numObservers(innerVal))

    val.set(1)

    assert.spy(fn).called(4)
    assert.spy(fn).called_with(match._, 5, 2)
  })

  test("gives correct value for get()", () => {
    const val = state(3)
    const mapped = val.flatMap({ invoke: (x) => state(x * 2) })
    assert.same(6, mapped.get())

    val.set(4)

    assert.same(8, mapped.get())
  })
})
