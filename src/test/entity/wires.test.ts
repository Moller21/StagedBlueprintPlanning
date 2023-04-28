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
import { CableAddResult, MutableAssemblyContent, newAssemblyContent } from "../../entity/AssemblyContent"
import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { AsmCircuitConnection } from "../../entity/circuit-connection"
import { shallowCompare } from "../../lib"
import { setupTestSurfaces } from "../assembly/Assembly-mock"

let content: MutableAssemblyContent
const surfaces = setupTestSurfaces(2)
let surface: LuaSurface

before_each(() => {
  content = newAssemblyContent()
  surface = surfaces[0]
  surface.find_entities().forEach((e) => e.destroy())
})

import handler = require("../../entity/wires")

describe("circuit wires", () => {
  let luaEntity1: LuaEntity
  let luaEntity2: LuaEntity
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  before_each(() => {
    luaEntity1 = surface.create_entity({ name: "arithmetic-combinator", position: { x: 5.5, y: 6 } })!
    luaEntity2 = surface.create_entity({ name: "arithmetic-combinator", position: { x: 7.5, y: 6 } })!
    entity1 = createAssemblyEntity({ name: "arithmetic-combinator" }, { x: 5.5, y: 6 }, nil, 1)
    entity2 = createAssemblyEntity({ name: "arithmetic-combinator" }, { x: 7.5, y: 6 }, nil, 1)
    entity1.replaceWorldEntity(1, luaEntity1)
    entity2.replaceWorldEntity(1, luaEntity2)
    content.add(entity1)
    content.add(entity2)
  })

  function addWire1(): void {
    luaEntity1.connect_neighbour({
      target_entity: luaEntity2,
      wire: defines.wire_type.red,
      source_circuit_id: defines.circuit_connector_id.combinator_input,
      target_circuit_id: defines.circuit_connector_id.combinator_output,
    })
  }
  function getExpectedWire1(): AsmCircuitConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      wire: defines.wire_type.red,
      fromId: defines.circuit_connector_id.combinator_input,
      toId: defines.circuit_connector_id.combinator_output,
    }
  }
  function addWire2(): void {
    luaEntity2.connect_neighbour({
      target_entity: luaEntity1,
      wire: defines.wire_type.green,
      source_circuit_id: defines.circuit_connector_id.combinator_input,
      target_circuit_id: defines.circuit_connector_id.combinator_output,
    })
  }
  function getExpectedWire2(): AsmCircuitConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      wire: defines.wire_type.green,
      fromId: defines.circuit_connector_id.combinator_output,
      toId: defines.circuit_connector_id.combinator_input,
    }
  }
  function addWire3(): void {
    // same as wire 1, but green
    luaEntity1.connect_neighbour({
      target_entity: luaEntity2,
      wire: defines.wire_type.green,
      source_circuit_id: defines.circuit_connector_id.combinator_input,
      target_circuit_id: defines.circuit_connector_id.combinator_output,
    })
  }
  function getExpectedWire3(): AsmCircuitConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      wire: defines.wire_type.green,
      fromId: defines.circuit_connector_id.combinator_input,
      toId: defines.circuit_connector_id.combinator_output,
    }
  }

  describe("update circuit connections", () => {
    test("can remove wires", () => {
      addWire1()
      addWire2()
      handler.updateWireConnectionsAtStage(content, entity1, 1)
      expect(luaEntity1.circuit_connection_definitions ?? []).to.equal([])
      expect(luaEntity2.circuit_connection_definitions ?? []).to.equal([])
    })
    function assertWire1Matches(): void {
      expect(luaEntity1.circuit_connection_definitions).to.equal([
        {
          target_entity: luaEntity2,
          wire: defines.wire_type.red,
          source_circuit_id: defines.circuit_connector_id.combinator_input,
          target_circuit_id: defines.circuit_connector_id.combinator_output,
        } as CircuitConnectionDefinition,
      ])
    }
    test("can add wires", () => {
      content.addCircuitConnection(getExpectedWire1())
      handler.updateWireConnectionsAtStage(content, entity1, 1)
      assertWire1Matches()
    })
    test("can update wires", () => {
      addWire1()
      addWire2()
      content.addCircuitConnection(getExpectedWire1())
      handler.updateWireConnectionsAtStage(content, entity1, 1)
      assertWire1Matches()
    })
    test("ignores entities not in the assembly", () => {
      addWire1() // entity1 -> entity2
      content.delete(entity2)
      handler.updateWireConnectionsAtStage(content, entity1, 1)
      // wire should still be there
      assertWire1Matches()
    })

    test("can update wire connected to itself", () => {
      const wire1 = {
        fromEntity: entity1,
        toEntity: entity1,
        wire: defines.wire_type.red,
        fromId: defines.circuit_connector_id.combinator_input,
        toId: defines.circuit_connector_id.combinator_output,
      }
      content.addCircuitConnection(wire1)
      handler.updateWireConnectionsAtStage(content, entity1, 1)

      expect(luaEntity1.circuit_connection_definitions).to.equal([
        {
          target_entity: luaEntity1,
          wire: defines.wire_type.red,
          source_circuit_id: defines.circuit_connector_id.combinator_input,
          target_circuit_id: defines.circuit_connector_id.combinator_output,
        } as CircuitConnectionDefinition,
        {
          target_entity: luaEntity1,
          wire: defines.wire_type.red,
          source_circuit_id: defines.circuit_connector_id.combinator_output,
          target_circuit_id: defines.circuit_connector_id.combinator_input,
        } as CircuitConnectionDefinition,
      ])
    })
  })

  describe("saving wire connections", () => {
    test.each<[number[], number[], string]>([
      [[1, 2], [1, 2], "no change"],
      [[1], [1, 2], "add"],
      [[], [1, 2], "add2"],
      [[1, 2], [1], "remove"],
      [[1], [2], "add and remove"],
      [[1, 2], [], "remove 2"],
      [[1], [1, 3], "add different"],
      [[1, 2], [1, 3], "mixed"],
    ])("diff: %s -> %s: %s", (existing, world) => {
      const wires = [getExpectedWire1(), getExpectedWire2(), getExpectedWire3()]
      for (const number of existing) content.addCircuitConnection(wires[number - 1])
      for (const number of world) [addWire1, addWire2, addWire3][number - 1]()

      const [hasDiff, maxConnectionsReached] = handler.saveWireConnections(content, entity1, 1)
      expect(hasDiff).to.be(!shallowCompare(existing, world))
      expect(maxConnectionsReached).to.be.nil() // not relevant for circuit wires

      const connections = content.getCircuitConnections(entity1)?.get(entity2)
      expect(Object.keys(connections ?? {})).to.equal(world.map((number) => wires[number - 1]))
    })
  })
})

describe("cable connections", () => {
  let luaEntity1: LuaEntity
  let luaEntity2: LuaEntity
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  let luaEntity3: LuaEntity
  let entity3: AssemblyEntity
  function setup(n: number) {
    const pos = { x: 5.5 + n, y: 5.5 + n }
    const luaEntity = surface.create_entity({ name: "medium-electric-pole", position: pos })!
    luaEntity.disconnect_neighbour()
    const entity = createAssemblyEntity({ name: "medium-electric-pole" }, pos, nil, 1)
    entity.replaceWorldEntity(1, luaEntity)
    content.add(entity)
    return { luaEntity, entity }
  }
  before_each(() => {
    ;({ luaEntity: luaEntity1, entity: entity1 } = setup(1))
    ;({ luaEntity: luaEntity2, entity: entity2 } = setup(2))
    ;({ luaEntity: luaEntity3, entity: entity3 } = setup(3))
  })

  test("can add cables", () => {
    content.addCableConnection(entity1, entity2)
    handler.updateWireConnectionsAtStage(content, entity1, 1)
    expect((luaEntity1.neighbours as { copper: LuaEntity[] }).copper).to.equal([luaEntity2])
    expect((luaEntity2.neighbours as { copper: LuaEntity[] }).copper).to.equal([luaEntity1])
  })

  test("can remove cables", () => {
    luaEntity1.connect_neighbour(luaEntity2)
    handler.updateWireConnectionsAtStage(content, entity1, 1)
    expect((luaEntity1.neighbours as { copper: LuaEntity[] }).copper).to.equal([])
    expect((luaEntity2.neighbours as { copper: LuaEntity[] }).copper).to.equal([])
  })

  test("can update cables", () => {
    content.addCableConnection(entity1, entity2) // 1-2
    luaEntity2.connect_neighbour(luaEntity3)
    handler.updateWireConnectionsAtStage(content, entity2, 1)
    // should now only have 1-2
    expect((luaEntity1.neighbours as { copper: LuaEntity[] }).copper).to.equal([luaEntity2])
    expect((luaEntity2.neighbours as { copper: LuaEntity[] }).copper).to.equal([luaEntity1])
    expect((luaEntity3.neighbours as { copper: LuaEntity[] }).copper).to.equal([])
  })

  test("ignores entities not in the assembly", () => {
    luaEntity1.connect_neighbour(luaEntity2)
    content.delete(entity2)
    handler.updateWireConnectionsAtStage(content, entity1, 1)
    // cable should still be there
    expect((luaEntity1.neighbours as { copper: LuaEntity[] }).copper).to.equal([luaEntity2])
  })

  describe("saving cables", () => {
    test.each<[number[], number[], string]>([
      [[1, 2], [1, 2], "no change"],
      [[1], [1, 2], "add"],
      [[], [1, 2], "add2"],
      [[1, 2], [1], "remove"],
      [[1], [2], "add and remove"],
      [[1, 2], [], "remove 2"],
    ])("diff: %s -> %s: %s", (existing, world) => {
      if (existing.includes(1)) content.addCableConnection(entity1, entity2)
      if (existing.includes(2)) content.addCableConnection(entity2, entity3)
      if (world.includes(1)) luaEntity1.connect_neighbour(luaEntity2)
      if (world.includes(2)) luaEntity2.connect_neighbour(luaEntity3)

      const [hasDiff, maxConnectionsReached] = handler.saveWireConnections(content, entity2, 1)
      expect(hasDiff).to.be(!shallowCompare(existing, world))
      expect(maxConnectionsReached).to.be.nil()

      const connections = content.getCableConnections(entity2)
      expect(Object.keys(connections ?? {})).to.equal(world.map((number) => [entity1, entity3][number - 1]))
    })

    test("can add cables in multiple stages", () => {
      const otherLuaEntity3 = surfaces[1].create_entity({ name: "medium-electric-pole", position: entity3.position })!
      const otherLuaEntity2 = surfaces[1].create_entity({ name: "medium-electric-pole", position: entity2.position })!
      entity2.replaceWorldEntity(2, otherLuaEntity2)
      entity3.replaceWorldEntity(2, otherLuaEntity3)
      entity3.setFirstStageUnchecked(2)
      otherLuaEntity2.connect_neighbour(otherLuaEntity3)
      luaEntity2.connect_neighbour(luaEntity1)
      // should connect both 1-2 and 2-3
      handler.saveWireConnections(content, entity2, 1, 2)

      const connections = content.getCableConnections(entity2)
      expect(Object.keys(connections ?? {})).to.equal([entity1, entity3])
    })

    test("max connections reached", () => {
      // max connections is 5
      for (let i = 0; i < 5; i++) {
        const entity = createAssemblyEntity(
          { name: "medium-electric-pole" },
          {
            x: 4.5 + i,
            y: 5.5 + i,
          },
          nil,
          1,
        )
        // no lua entity
        content.add(entity)
        const result = content.addCableConnection(entity1, entity)
        expect(result).to.be(CableAddResult.Added)
      }
      luaEntity1.connect_neighbour(luaEntity2)
      // saving should fail
      {
        const [hasDiff, maxConnectionsReached] = handler.saveWireConnections(content, entity1, 1)
        expect(hasDiff).to.be(true)
        expect(maxConnectionsReached).to.be(true)
        expect(content.getCableConnections(entity2)).to.be.nil()
        expect(content.getCableConnections(entity1)!.has(entity2)).to.be(false)
      }
      {
        const [hasDiff, maxConnectionsReached] = handler.saveWireConnections(content, entity2, 1)
        expect(hasDiff).to.be(true)
        expect(maxConnectionsReached).to.be(true)
        expect(content.getCableConnections(entity2)).to.be.nil()
        expect(content.getCableConnections(entity1)!.has(entity2)).to.be(false)
      }
    })
  })
})
