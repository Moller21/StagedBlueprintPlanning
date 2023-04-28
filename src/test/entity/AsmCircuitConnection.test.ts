/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import {
  AsmCircuitConnection,
  circuitConnectionEquals,
  circuitConnectionMatches,
  getDirectionalInfo,
} from "../../entity/circuit-connection"
import { shallowCopy } from "../../lib"

test("circuitConnectionEquals", () => {
  const entityA = {} as any
  const entityB = {} as any

  const circuitConnectionA: AsmCircuitConnection = {
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    toEntity: entityB,
    toId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  const identical = shallowCopy(circuitConnectionA)
  const circuitConnectionB: AsmCircuitConnection = {
    toEntity: entityA,
    toId: defines.circuit_connector_id.accumulator,
    fromEntity: entityB,
    fromId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  expect(circuitConnectionEquals(circuitConnectionA, identical)).to.be(true)
  expect(circuitConnectionEquals(circuitConnectionA, circuitConnectionB)).to.be(true)

  const different: AsmCircuitConnection = {
    toEntity: entityA,
    toId: defines.circuit_connector_id.constant_combinator,
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    wire: defines.wire_type.red,
  }
  expect(circuitConnectionEquals(circuitConnectionA, different)).to.be(false)
  expect(circuitConnectionEquals(circuitConnectionB, different)).to.be(false)
})

test("getDirectionalInfo", () => {
  const entityA = {} as any
  const entityB = {} as any

  const circuitConnectionA: AsmCircuitConnection = {
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    toEntity: entityB,
    toId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  expect(getDirectionalInfo(circuitConnectionA, entityA)).to.equal([
    entityB,
    defines.circuit_connector_id.accumulator,
    defines.circuit_connector_id.constant_combinator,
  ])
  expect(getDirectionalInfo(circuitConnectionA, entityB)).to.equal([
    entityA,
    defines.circuit_connector_id.constant_combinator,
    defines.circuit_connector_id.accumulator,
  ])
})
test("circuitConnectionMatches", () => {
  const entityA = {} as any
  const entityB = {} as any

  const connection: AsmCircuitConnection = {
    fromEntity: entityA,
    fromId: 0,
    toEntity: entityB,
    toId: 1,
    wire: defines.wire_type.red,
  }
  expect(circuitConnectionMatches(connection, defines.wire_type.red, entityA, 1, 0)).to.be(true)
  expect(circuitConnectionMatches(connection, defines.wire_type.red, entityB, 0, 1)).to.be(true)
  expect(circuitConnectionMatches(connection, defines.wire_type.green, entityA, 1, 0)).to.be(false)
  expect(circuitConnectionMatches(connection, defines.wire_type.red, entityA, 0, 1)).to.be(false)
})
