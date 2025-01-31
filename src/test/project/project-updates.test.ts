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

import {
  BlueprintEntity,
  LuaEntity,
  LuaSurface,
  SurfaceCreateEntity,
  UndergroundBeltSurfaceCreateEntity,
} from "factorio:runtime"
import expect, { mock } from "tstl-expect"
import { oppositedirection } from "util"
import { UndergroundBeltEntity } from "../../entity/Entity"
import {
  createProjectEntityNoCopy,
  ProjectEntity,
  RollingStockProjectEntity,
  StageDiffsInternal,
  StageNumber,
} from "../../entity/ProjectEntity"
import { Pos } from "../../lib/geometry"
import { EntityUpdateResult, ProjectUpdates, StageMoveResult } from "../../project/project-updates"
import { Project } from "../../project/ProjectDef"
import { WorldEntityUpdates } from "../../project/world-entity-updates"
import { createRollingStock, createRollingStocks } from "../entity/createRollingStock"
import { fMock } from "../f-mock"
import { moduleMock } from "../module-mock"
import { createMockProject, setupTestSurfaces } from "./Project-mock"
import _wireHandler = require("../../entity/wires")
import direction = defines.direction
import wire_type = defines.wire_type

const pos = Pos(10.5, 10.5)

let project: Project
const surfaces: LuaSurface[] = setupTestSurfaces(6)

const worldEntityUpdates = fMock<WorldEntityUpdates>()
const wireSaver = moduleMock(_wireHandler, true)

let projectUpdates: ProjectUpdates
before_each(() => {
  project = createMockProject(surfaces)
  project.entityUpdates = worldEntityUpdates
  project.updates = projectUpdates = ProjectUpdates(project, project.entityUpdates)
})

let expectedWuCalls: number
before_each(() => {
  expectedWuCalls = 0

  wireSaver.saveWireConnections.returns(false as any)

  game.surfaces[1].find_entities().forEach((e) => e.destroy())
})

function numWuCalls(): number {
  let worldUpdaterCalls = 0
  for (const [, mock] of pairs(worldEntityUpdates)) {
    worldUpdaterCalls += mock.numCalls
  }
  return worldUpdaterCalls
}
after_each(() => {
  const worldUpdaterCalls = numWuCalls()
  if (expectedWuCalls == worldUpdaterCalls) return

  let message = `expected ${expectedWuCalls} calls to worldUpdater, got ${worldUpdaterCalls}\n`
  for (const [key, fn] of pairs(worldEntityUpdates)) {
    if (fn.calls.length > 0) {
      message += `  ${key} called ${fn.calls.length} times\n`
    }
  }
  error(message)
})

function clearMocks(): void {
  mock.clear(worldEntityUpdates)
  mock.clear(wireSaver)
  expectedWuCalls = 0
}

function assertWUNotCalled() {
  for (const [, spy] of pairs(worldEntityUpdates)) {
    expect(spy).not.toHaveBeenCalled()
  }
}
function assertUpdateCalled(
  entity: ProjectEntity,
  startStage: StageNumber,
  n?: number,
  updateHighlights?: boolean,
): void {
  expectedWuCalls++
  if (n == nil) expect(numWuCalls()).toBe(1)
  expect(worldEntityUpdates.updateWorldEntities).toHaveBeenNthCalledWith(n ?? 1, entity, startStage, updateHighlights)
  if (updateHighlights == false) {
    expect(worldEntityUpdates.updateAllHighlights).toHaveBeenCalledWith(entity)
    expectedWuCalls++
  }
}

function assertUpdateOnLastStageChangedCalled(entity: ProjectEntity, startStage: StageNumber) {
  expectedWuCalls++
  expect(numWuCalls()).toBe(1)
  expect(worldEntityUpdates.updateWorldEntitiesOnLastStageChanged).toHaveBeenCalledWith(entity, startStage)
}

function assertRefreshCalled(entity: ProjectEntity, stage: StageNumber) {
  expectedWuCalls++
  expect(worldEntityUpdates.refreshWorldEntityAtStage).toHaveBeenCalledWith(entity, stage)
}
function assertResetUndergroundRotationCalled(entity: ProjectEntity, stage: StageNumber) {
  expectedWuCalls++
  expect(worldEntityUpdates.resetUnderground).toHaveBeenCalledWith(entity, stage)
}
function assertReplaceCalled(entity: ProjectEntity, stage: StageNumber) {
  expectedWuCalls++
  expect(worldEntityUpdates.rebuildWorldEntityAtStage).toHaveBeenCalledWith(entity, stage)
}
function assertDeleteWorldEntityCalled(entity: ProjectEntity) {
  expectedWuCalls++
  expect(numWuCalls()).toBe(1)
  expect(worldEntityUpdates.deleteWorldEntities).toHaveBeenCalledWith(entity)
}
function assertMakeSettingsRemnantCalled(entity: ProjectEntity) {
  expectedWuCalls++
  expect(numWuCalls()).toBe(1)
  expect(worldEntityUpdates.makeSettingsRemnant).toHaveBeenCalledWith(entity)
}
function assertReviveSettingsRemnantCalled(entity: ProjectEntity) {
  expectedWuCalls++
  expect(numWuCalls()).toBe(1)
  expect(worldEntityUpdates.reviveSettingsRemnant).toHaveBeenCalledWith(entity)
}

function assertOneEntity() {
  expect(project.content.countNumEntities()).toBe(1)
}
function assertNEntities(n: number) {
  expect(project.content.countNumEntities()).toBe(n)
}
function assertNoEntities() {
  expect(project.content.countNumEntities()).toEqual(0)
}

function assertStageDiffs(entity: ProjectEntity, changes: StageDiffsInternal<BlueprintEntity>) {
  expect(entity.getStageDiffs()).toEqual(changes)
}

function createEntity(stageNum: StageNumber, args?: Partial<SurfaceCreateEntity>): LuaEntity {
  const params = {
    name: "filter-inserter",
    position: pos,
    force: "player",
    ...args,
  }
  const entity = assert(surfaces[stageNum - 1].create_entity(params), "created entity")[0]
  const proto = game.entity_prototypes[params.name]
  if (proto.type == "inserter") {
    entity.inserter_stack_size_override = 1
    entity.inserter_filter_mode = "whitelist"
  }
  return entity
}
function assertNewUpdated(entity: ProjectEntity) {
  expect(worldEntityUpdates.updateNewWorldEntitiesWithoutWires).toHaveBeenCalledWith(entity)
  expectedWuCalls = 1
  if (project.content.getCircuitConnections(entity) || project.content.getCableConnections(entity)) {
    expect(worldEntityUpdates.updateWireConnections).toHaveBeenCalledWith(entity)
    expectedWuCalls++
  }
}

describe("addNewEntity", () => {
  test("simple add", () => {
    const luaEntity = createEntity(2)
    const entity = projectUpdates.addNewEntity(luaEntity, 2)!
    expect(entity).toBeAny()
    expect(entity.firstValue.name).toBe("filter-inserter")
    expect(entity.position).toEqual(pos)
    expect(entity.direction).toBe(0)

    const found = project.content.findCompatibleWithLuaEntity(luaEntity, nil, 2) as ProjectEntity<BlueprintEntity>
    expect(found).toBe(entity)

    expect(entity.getWorldEntity(2)).toBe(luaEntity)

    assertOneEntity()
    assertNewUpdated(entity)
  })

  test("addNewEntity with known value with same name", () => {
    const luaEntity = createEntity(2)
    const entity = projectUpdates.addNewEntity(luaEntity, 2, {
      entity_number: 1,
      direction: 0,
      position: { x: 0, y: 0 },
      name: "filter-inserter",
      neighbours: [2],
    })!
    expect(entity).toBeAny()
    expect(entity.firstValue).toEqual({
      name: "filter-inserter",
    })
    expect(entity.position).toEqual(pos)
    expect(entity.direction).toBe(0)

    const found = project.content.findCompatibleWithLuaEntity(luaEntity, nil, 2) as ProjectEntity<BlueprintEntity>
    expect(found).toBe(entity)

    expect(entity.getWorldEntity(2)).toBe(luaEntity)

    assertOneEntity()
    assertNewUpdated(entity)
  })

  test("addNewEntity with known value with different name", () => {
    const luaEntity = createEntity(2)
    const entityUpgraded = projectUpdates.addNewEntity(luaEntity, 2, {
      entity_number: 1,
      direction: 0,
      position: { x: 0, y: 0 },
      name: "fast-inserter",
      neighbours: [2],
    })!
    expect(entityUpgraded).toBeAny()
    expect(entityUpgraded.firstValue).toEqual({
      name: "fast-inserter",
    })
    expect(entityUpgraded.position).toEqual(pos)

    const found = project.content.findCompatibleWithLuaEntity(luaEntity, nil, 2) as ProjectEntity<BlueprintEntity>
    expect(found).toBe(entityUpgraded)

    assertOneEntity()
    assertNewUpdated(entityUpgraded)
  })
})

function addEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>) {
  const luaEntity = createEntity(stage, args)
  const entity = projectUpdates.addNewEntity(luaEntity, stage) as ProjectEntity<BlueprintEntity>
  expect(entity).toBeAny()
  clearMocks()
  entity.replaceWorldEntity(stage, luaEntity)
  return { entity, luaEntity }
}

test("moving entity on preview replace", () => {
  const { entity } = addEntity(2)

  // assert(projectUpdates.moveFirstStageDownOnPreviewReplace( entity, 1))
  expect(projectUpdates.trySetFirstStage(entity, 1)).toBe(StageMoveResult.Updated)

  expect(entity.firstStage).toEqual(1)
  expect((entity.firstValue as BlueprintEntity).override_stack_size).toBe(1)
  expect(entity.hasStageDiff()).toBe(false)
  assertOneEntity()
  assertUpdateCalled(entity, 1)
})

test("tryReviveSettingsRemnant", () => {
  const { entity } = addEntity(2)
  entity.isSettingsRemnant = true

  projectUpdates.tryReviveSettingsRemnant(entity, 1)

  expect(entity.isSettingsRemnant).toBeNil()
  expect(entity.firstStage).toEqual(1)
  assertOneEntity()
  assertReviveSettingsRemnantCalled(entity)
})

test("cannot tryReviveSettingsRemnant if not a remnant", () => {
  const { entity } = addEntity(2)

  expect(projectUpdates.tryReviveSettingsRemnant(entity, 1)).toBe(StageMoveResult.NoChange)
  assertOneEntity()
  assertWUNotCalled()
})

describe("deleteEntityOrCreateSettingsRemnant", () => {
  test("deletes normal entity", () => {
    const { entity } = addEntity(1)

    projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)
    assertNoEntities()
    assertDeleteWorldEntityCalled(entity)
  })

  test("creates settings remnant if entity has stage diffs", () => {
    const { entity } = addEntity(1)
    entity._applyDiffAtStage(2, { override_stack_size: 2 })

    projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)

    expect(entity.isSettingsRemnant).toBe(true)
    assertOneEntity()
    assertMakeSettingsRemnantCalled(entity)
  })

  test("creates settings remnant if entity has circuit connections", () => {
    const { entity } = addEntity(1)
    const otherEntity = createProjectEntityNoCopy({ name: "filter-inserter" }, Pos(0, 0), nil, 1)
    project.content.add(otherEntity)
    project.content.addCircuitConnection({
      fromEntity: otherEntity,
      toEntity: entity,
      fromId: 1,
      toId: 1,
      wire: wire_type.green,
    })

    projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)
    expect(entity.isSettingsRemnant).toBe(true)
    assertNEntities(2)
    assertMakeSettingsRemnantCalled(entity)
  })

  test("deletes if entity has with circuit connections, but connections have world entity", () => {
    const { entity } = addEntity(1)
    const otherEntity = createProjectEntityNoCopy({ name: "filter-inserter" }, Pos(0, 0), nil, 1)
    project.content.add(otherEntity)
    project.content.addCircuitConnection({
      fromEntity: otherEntity,
      toEntity: entity,
      fromId: 1,
      toId: 1,
      wire: wire_type.green,
    })
    otherEntity.replaceWorldEntity(
      1,
      createEntity(1, {
        position: Pos.plus(entity.position, { x: 0, y: 1 }),
      }),
    )

    projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)
    expect(entity.isSettingsRemnant).toBeNil()
    assertOneEntity()
    assertDeleteWorldEntityCalled(entity)
  })
})

test("forceDeleteEntity always deletes", () => {
  const { entity } = addEntity(1)
  entity.isSettingsRemnant = true

  projectUpdates.forceDeleteEntity(entity)

  assertNoEntities()
  assertDeleteWorldEntityCalled(entity)
})

describe("tryUpdateEntityFromWorld", () => {
  test('with no changes returns "no-change"', () => {
    const { entity } = addEntity(2)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("no-change")
    assertOneEntity()
    assertWUNotCalled()
  })

  test('with change in first stage returns "updated" and updates all entities', () => {
    const { entity, luaEntity } = addEntity(2)
    luaEntity.inserter_stack_size_override = 3
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")

    expect(entity.firstValue.override_stack_size).toBe(3)

    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })
  test('with change in first stage and known value returns "updated" and updates all entities', () => {
    const { entity } = addEntity(2)
    const knownValue = {
      name: "filter-inserter",
      override_stack_size: 3,
    }
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2, knownValue as BlueprintEntity)
    expect(ret).toBe("updated")

    expect(entity.firstValue.override_stack_size).toBe(3)

    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })

  test("can detect rotate by pasting", () => {
    const { luaEntity, entity } = addEntity(2, {
      name: "assembling-machine-2",
      recipe: "express-transport-belt",
    })
    luaEntity.direction = defines.direction.east
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")

    expect(entity.direction).toBe(defines.direction.east)
    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })

  test("forbids rotate if in higher stage than first", () => {
    const { luaEntity, entity } = addEntity(2)
    luaEntity.direction = defines.direction.east

    entity.replaceWorldEntity(3, luaEntity)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 3)
    expect(ret).toBe("cannot-rotate")
    expect(entity.direction).toBe(defines.direction.north)

    assertOneEntity()
    assertRefreshCalled(entity, 3)
  })

  test.each([false, true])("integration: in higher stage, with changes: %s", (withExistingChanges) => {
    const { luaEntity, entity } = addEntity(1)
    if (withExistingChanges) {
      entity._applyDiffAtStage(2, { override_stack_size: 2, filter_mode: "blacklist" })
      luaEntity.inserter_filter_mode = "blacklist"
    }

    luaEntity.inserter_stack_size_override = 3
    entity.replaceWorldEntity(2, luaEntity)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")

    expect(entity.firstValue.override_stack_size).toBe(1)
    if (withExistingChanges) {
      assertStageDiffs(entity, { 2: { override_stack_size: 3, filter_mode: "blacklist" } })
    } else {
      assertStageDiffs(entity, { 2: { override_stack_size: 3 } })
    }

    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })

  test("integration: updating to match removes stage diff", () => {
    const { luaEntity, entity } = addEntity(1)
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    expect(entity.hasStageDiff()).toBe(true)
    luaEntity.inserter_stack_size_override = 1

    entity.replaceWorldEntity(2, luaEntity)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")
    expect(entity.hasStageDiff()).toBe(false)

    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })
})

describe("tryRotateEntityFromWorld", () => {
  test("in first stage rotates all entities", () => {
    const { luaEntity, entity } = addEntity(2)
    luaEntity.direction = direction.west
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")
    expect(entity.direction).toBe(direction.west)
    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })

  test("in higher stage forbids rotation", () => {
    const { luaEntity, entity } = addEntity(1)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    entity.replaceWorldEntity(2, luaEntity)
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 2)
    expect(ret).toBe("cannot-rotate")
    expect(entity.direction).toBe(oldDirection)
    assertOneEntity()
    assertRefreshCalled(entity, 2)
  })

  test("rotating loader also sets loader type", () => {
    const { luaEntity, entity } = addEntity(1, { name: "loader", direction: direction.north, type: "input" })
    luaEntity.rotate()
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 1)
    expect(ret).toBe("updated")
    expect(entity.direction).toBe(direction.south)
    expect(entity.firstValue.type).toBe("output")
    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
})

describe("ignores assembling machine rotation if no fluid inputs", () => {
  let luaEntity: LuaEntity, entity: ProjectEntity<BlueprintEntity>
  before_each(() => {
    ;({ luaEntity, entity } = addEntity(2, {
      name: "assembling-machine-2",
      direction: defines.direction.east,
    }))

    entity.replaceWorldEntity(3, luaEntity)
    // hacky way to rotate
    luaEntity.set_recipe("express-transport-belt")
    luaEntity.direction = defines.direction.south
    luaEntity.set_recipe(nil)
    expect(luaEntity.direction).toBe(defines.direction.south)
  })
  test("using update", () => {
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 3)
    expect(ret).toBe("no-change")
    expect(entity.direction).toBe(0)

    assertOneEntity()
    assertWUNotCalled()
  })
  test("using rotate", () => {
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 3)
    expect(ret).toBe("no-change")
    expect(entity.direction).toBe(0)

    assertOneEntity()
    assertWUNotCalled()
  })
  test("can change recipe and rotate", () => {
    luaEntity.set_recipe("iron-gear-wheel")
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 3)
    expect(ret).toBe("updated")
    expect(entity.getValueAtStage(3)!.recipe).toBe("iron-gear-wheel")

    assertOneEntity()
    assertUpdateCalled(entity, 3)
  })
  test("disallows if has fluid inputs", () => {
    luaEntity.set_recipe("express-transport-belt")
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 3)
    expect(ret).toBe("cannot-rotate")

    assertOneEntity()
    assertRefreshCalled(entity, 3)
  })
})

describe("tryUpgradeEntityFromWorld", () => {
  test("can apply upgrade", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: "stack-filter-inserter",
    })
    const direction = luaEntity.direction
    const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 1)
    expect(ret).toBe("updated")
    expect(entity.firstValue.name).toBe("stack-filter-inserter")
    expect(entity.direction).toBe(direction)
    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
  test("can apply rotation", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: luaEntity.name,
      direction: direction.west,
    })

    const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 1)
    expect(ret).toBe("updated")
    expect(entity.firstValue.name).toBe("filter-inserter")
    expect(entity.direction).toBe(direction.west)
    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
  test("upgrade to rotate forbidden", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: luaEntity.name,
      direction: direction.west,
    })
    entity.replaceWorldEntity(2, luaEntity)
    const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 2)
    expect(ret).toBe("cannot-rotate")
    expect(entity.direction).toBe(0)
    assertOneEntity()
    assertRefreshCalled(entity, 2)
  })
  test("upgrade to rotation allowed if is assembling machine with no fluid inputs", () => {
    const { luaEntity, entity } = addEntity(1, {
      name: "assembling-machine-2",
      direction: defines.direction.east,
      recipe: "express-transport-belt",
    })
    luaEntity.set_recipe(nil)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: "assembling-machine-3",
      direction: direction.north,
    })
    entity.replaceWorldEntity(2, luaEntity)
    const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")
    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })
})

describe("updateWiresFromWorld", () => {
  test("if saved, calls update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.returnsOnce(true as any)
    const ret = projectUpdates.updateWiresFromWorld(entity, 1)
    expect(ret).toBe("updated")

    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
  test("if no changes, does not call update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.returnsOnce(false as any)
    const ret = projectUpdates.updateWiresFromWorld(entity, 1)
    expect(ret).toBe("no-change")

    assertOneEntity()
    assertWUNotCalled()
  })
  test("doesn't crash if neighbor in previous stage doesn't exist", () => {
    const { entity: entity1 } = addEntity(2)
    const { entity: entity2, luaEntity: luaEntity2 } = addEntity(1, {
      position: pos.plus({ x: 1, y: 0 }),
    })
    project.content.addCircuitConnection({
      fromEntity: entity1,
      toEntity: entity2,
      fromId: 1,
      toId: 1,
      wire: defines.wire_type.green,
    })
    wireSaver.saveWireConnections.returnsOnce(true as any)
    luaEntity2.destroy()

    const ret = projectUpdates.updateWiresFromWorld(entity1, 2)
    expect(ret).toBe("updated")

    assertNEntities(2)
    assertUpdateCalled(entity1, 2, 1)
    assertUpdateCalled(entity2, 1, 2)
  })
  // test.todo(
  //   "if max connections exceeded, notifies and calls update",
  //   // , () => {
  //   // const { entity } = addEntity(1)
  //   // wireSaver.saveWireConnections.returnsOnce(true as any)
  //   // const ret = projectUpdates.updateWiresFromWorld( entity, 2)
  //   // expect(ret).toBe("max-connections-exceeded")
  //   //
  //   // assertOneEntity()
  //   // assertUpdateCalled(entity, 1, nil)
  //   // }
  // )
})

describe("trySetFirstStage", () => {
  test("can move up", () => {
    const { entity } = addEntity(1)
    const result = projectUpdates.trySetFirstStage(entity, 2)
    expect(result).toBe("updated")
    expect(entity.firstStage).toBe(2)
    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })

  test("can move down to preview", () => {
    const { entity } = addEntity(4)
    const result = projectUpdates.trySetFirstStage(entity, 3)
    expect(result).toBe("updated")
    expect(entity.firstStage).toBe(3)
    assertOneEntity()
    assertUpdateCalled(entity, 3)
  })

  test("ignores settings remnants", () => {
    const { entity } = addEntity(1)
    entity.isSettingsRemnant = true
    const result = projectUpdates.trySetFirstStage(entity, 2)
    expect(result).toBe(StageMoveResult.NoChange)
    expect(entity.firstStage).toBe(1)
    assertOneEntity()
    assertWUNotCalled()
  })

  test("returns no-change if already at stage", () => {
    const { entity } = addEntity(1)
    const result = projectUpdates.trySetFirstStage(entity, 1)
    expect(result).toBe(StageMoveResult.NoChange)
  })

  test("cannot move down if will intersect another entity", () => {
    const { entity: entity1 } = addEntity(1)
    entity1.setLastStageUnchecked(2)
    const { entity: entity2 } = addEntity(3) // prevents moving up

    const result = projectUpdates.trySetFirstStage(entity2, 2)
    expect(result).toBe(StageMoveResult.IntersectsAnotherEntity)
  })

  test("cannot move past last stage", () => {
    const { entity } = addEntity(1)
    entity.setLastStageUnchecked(2)
    const result = projectUpdates.trySetFirstStage(entity, 5)
    expect(result).toBe(StageMoveResult.CannotMovePastLastStage)
  })
})

describe("trySetLastStage", () => {
  test("can move down", () => {
    const { entity } = addEntity(2)
    entity.setLastStageUnchecked(3)
    const result = projectUpdates.trySetLastStage(entity, 2)
    expect(result).toBe("updated")
    expect(entity.lastStage).toBe(2)
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, 3)
  })
  test("can move up", () => {
    const { entity } = addEntity(2)
    entity.setLastStageUnchecked(3)
    const result = projectUpdates.trySetLastStage(entity, 4)
    expect(result).toBe("updated")
    expect(entity.lastStage).toBe(4)
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, 3)
  })

  test("can set to nil", () => {
    const { entity } = addEntity(2)
    entity.setLastStageUnchecked(3)
    const result = projectUpdates.trySetLastStage(entity, nil)
    expect(result).toBe("updated")
    expect(entity.lastStage).toBe(nil)
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, 3)
  })

  test("ignores settings remnants", () => {
    const { entity } = addEntity(1)
    entity.isSettingsRemnant = true
    const result = projectUpdates.trySetLastStage(entity, 2)
    expect(result).toBe(StageMoveResult.NoChange)
    expect(entity.lastStage).toBe(nil)
    assertOneEntity()
    assertWUNotCalled()
  })

  test("returns no-change if already at stage", () => {
    const { entity } = addEntity(1)
    entity.setLastStageUnchecked(2)
    const result = projectUpdates.trySetLastStage(entity, 2)
    expect(result).toBe(StageMoveResult.NoChange)
  })

  test("cannot move up if will intersect another entity", () => {
    const { entity: entity1 } = addEntity(1)
    entity1.setLastStageUnchecked(2)
    addEntity(3) // prevents moving down

    const result = projectUpdates.trySetLastStage(entity1, 3)
    expect(result).toBe(StageMoveResult.IntersectsAnotherEntity)
  })

  test("cannot move before first stage", () => {
    const { entity } = addEntity(1)
    entity.setLastStageUnchecked(2)
    const result = projectUpdates.trySetLastStage(entity, 0)
    expect(result).toBe(StageMoveResult.CannotMoveBeforeFirstStage)
  })
})

describe("undergrounds", () => {
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
  })
  function createUndergroundBelt(firstStage: StageNumber, args?: Partial<UndergroundBeltSurfaceCreateEntity>) {
    const { luaEntity, entity } = addEntity(firstStage, {
      name: "underground-belt",
      position: pos,
      direction: direction.west,
      ...args,
    })

    return { luaEntity, entity: entity as ProjectEntity<UndergroundBeltEntity> }
  }

  test("creating underground automatically sets to correct direction", () => {
    const { luaEntity } = createUndergroundBelt(1)
    luaEntity.destroy()
    const luaEntity2 = createEntity(1, {
      name: "underground-belt",
      position: Pos.plus(pos, { x: -3, y: 0 }),
      direction: direction.east,
      type: "input",
    })
    const entity = projectUpdates.addNewEntity(luaEntity2, 2) as ProjectEntity<UndergroundBeltEntity>
    expect(entity).toBeAny()

    expect(entity.firstValue.type).toBe("output")
    assertNEntities(2)

    assertNewUpdated(entity)
    // assert.spy(wireSaver.saveWireConnections).toHaveBeenCalledWith(project.content, entity, 1)
  })

  function createUndergroundBeltPair(
    firstStage: StageNumber,
    otherStage: StageNumber = firstStage,
  ): {
    luaEntity1: LuaEntity
    luaEntity2: LuaEntity
    entity1: ProjectEntity<UndergroundBeltEntity>
    entity2: ProjectEntity<UndergroundBeltEntity>
  } {
    const { luaEntity: luaEntity1, entity: entity1 } = createUndergroundBelt(firstStage)
    const { luaEntity: luaEntity2, entity: entity2 } = createUndergroundBelt(otherStage, {
      position: Pos.plus(pos, { x: -3, y: 0 }),
      type: "output",
    })
    return { luaEntity1, luaEntity2, entity1, entity2 }
  }

  describe("rotating", () => {
    test("lone underground belt in first stage rotates all entities", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)

      const [rotated] = luaEntity.rotate()
      assert(rotated)

      const ret = projectUpdates.tryRotateEntityFromWorld(entity, 1)
      expect(ret).toBe("updated")

      expect(entity.firstValue.type).toBe("output")
      expect(entity.direction).toBe(direction.east)

      assertOneEntity()
      assertUpdateCalled(entity, 1)
    })

    test("lone underground belt in higher stage forbids rotation", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)

      const [rotated] = luaEntity.rotate()
      assert(rotated)

      entity.replaceWorldEntity(2, luaEntity)
      const ret = projectUpdates.tryRotateEntityFromWorld(entity, 2)
      expect(ret).toBe("cannot-rotate")

      expect(entity.firstValue.type).toBe("input")
      expect(entity.direction).toBe(direction.west)

      assertOneEntity()
      assertResetUndergroundRotationCalled(entity, 2)
    })

    test.each(["lower", "higher"])("%s underground in first stage rotates pair", (which) => {
      const { entity1, entity2 } = createUndergroundBeltPair(1, 2)

      const entity = which == "lower" ? entity1 : entity2
      const [rotated] = entity.getWorldEntity(entity.firstStage)!.rotate()
      assert(rotated)

      const ret = projectUpdates.tryRotateEntityFromWorld(entity, entity.firstStage)
      expect(ret).toBe("updated")

      expect(entity1).toMatchTable({
        firstValue: { type: "output" },
        direction: direction.east,
      })
      expect(entity2).toMatchTable({
        firstValue: { type: "input" },
        direction: direction.east,
      })

      assertNEntities(2)
      assertUpdateCalled(entity1, 1, which == "lower" ? 1 : 2, false)
      assertUpdateCalled(entity2, 2, which == "lower" ? 2 : 1, false)
    })

    test("cannot rotate if not in first stage", () => {
      const { entity1, entity2, luaEntity1 } = createUndergroundBeltPair(2, 1)

      const [rotated1] = luaEntity1.rotate()
      assert(rotated1)

      entity1.replaceWorldEntity(3, luaEntity1)
      const ret = projectUpdates.tryRotateEntityFromWorld(entity1, 3)
      expect(ret).toBe("cannot-rotate")

      expect(entity1).toMatchTable({
        firstValue: { type: "input" },
        direction: direction.west,
      })
      expect(entity2).toMatchTable({
        firstValue: { type: "output" },
        direction: direction.west,
      })

      assertNEntities(2)
      assertResetUndergroundRotationCalled(entity1, 3)
    })
  })

  describe("upgrading", () => {
    test("can upgrade underground in first stage", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 1)
      expect(ret).toBe("updated")

      expect(entity.firstValue.name).toBe("fast-underground-belt")
      expect(entity.firstValue.type).toBe("input")
      expect(entity.direction).toBe(direction.west)
      assertOneEntity()
      assertUpdateCalled(entity, 1)
    })

    test("can upgrade underground in higher stage", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      entity.replaceWorldEntity(2, luaEntity)
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 2)
      expect(ret).toBe("updated")

      expect(entity.getValueAtStage(2)?.name).toBe("fast-underground-belt")
      expect(entity.firstValue.type).toBe("input")

      assertOneEntity()
      assertUpdateCalled(entity, 2)
    })

    test("can apply rotate via upgrade to underground belt", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "underground-belt",
        force: luaEntity.force,
        direction: oppositedirection(luaEntity.direction),
      })
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 1)
      expect(ret).toBe("updated")

      expect(entity).toMatchTable({
        firstValue: {
          name: "underground-belt",
          type: "output",
        },
        direction: direction.east,
      })
      assertOneEntity()
      assertUpdateCalled(entity, 1)
    })
    test("can both rotate and upgrade", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
        direction: oppositedirection(luaEntity.direction),
      })
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 1)
      expect(ret).toBe("updated")

      expect(entity).toMatchTable({
        firstValue: {
          name: "fast-underground-belt",
          type: "output",
        },
        direction: direction.east,
      })
      assertOneEntity()
      assertUpdateCalled(entity, 1)
    })
    test("if not in first stage, forbids both rotate and upgrade", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
        direction: oppositedirection(luaEntity.direction),
      })
      entity.replaceWorldEntity(2, luaEntity)
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 2)
      expect(ret).toBe("cannot-rotate")

      expect(entity).toMatchTable({
        firstValue: {
          name: "underground-belt",
          type: "input",
        },
        direction: direction.west,
      })

      assertOneEntity()
      assertResetUndergroundRotationCalled(entity, 2)
    })

    test.each(["lower", "pair in higher", "self in higher"])(
      "upgrading underground %s stage upgrades pair",
      (which) => {
        const endStage = which == "lower" ? 1 : 2
        const { entity1, entity2, luaEntity1, luaEntity2 } = createUndergroundBeltPair(1, 2)
        const entity = which == "pair in higher" ? entity2 : entity1
        const luaEntity = which == "pair in higher" ? luaEntity2 : luaEntity1
        luaEntity.order_upgrade({
          target: "fast-underground-belt",
          force: luaEntity.force,
        })
        entity.replaceWorldEntity(endStage, luaEntity)
        const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, endStage)
        expect(ret).toBe("updated")

        expect(entity1).toMatchTable({
          firstValue: { name: "fast-underground-belt", type: "input" },
          direction: direction.west,
        })
        expect(entity2).toMatchTable({
          firstValue: { name: "fast-underground-belt", type: "output" },
          direction: direction.west,
        })

        assertNEntities(2)
        assertUpdateCalled(entity1, 1, luaEntity == luaEntity1 ? 1 : 2, false)
        assertUpdateCalled(entity2, 2, luaEntity == luaEntity1 ? 2 : 1, false)
      },
    )

    test("cannot upgrade underground if it would change pair", () => {
      const { luaEntity1, entity1, entity2 } = createUndergroundBeltPair(1, 1)
      const { entity: entity3 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
        name: "fast-underground-belt",
      })
      luaEntity1.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity1.force,
      })

      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity1, 1)
      expect(ret).toBe("cannot-upgrade-changed-pair")

      expect(entity1.firstValue.name).toBe("underground-belt")
      expect(entity2.firstValue.name).toBe("underground-belt")
      expect(entity3.firstValue.name).toBe("fast-underground-belt")

      assertNEntities(3)
      assertRefreshCalled(entity1, 1)
      assertRefreshCalled(entity2, 1)
    })

    test("cannot upgrade underground if it would break existing pair", () => {
      const { entity1, entity2 } = createUndergroundBeltPair(1, 1)
      const { entity: entity3, luaEntity: luaEntity3 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
        name: "fast-underground-belt",
      })
      // downgrading entity3 would cut the pair
      luaEntity3.order_upgrade({
        target: "underground-belt",
        force: luaEntity3.force,
      })
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity3, 1)
      expect(ret).toBe("cannot-upgrade-changed-pair")

      expect(entity1.firstValue.name).toBe("underground-belt")
      expect(entity2.firstValue.name).toBe("underground-belt")
      expect(entity3.firstValue.name).toBe("fast-underground-belt")

      assertNEntities(3)
      assertRefreshCalled(entity3, 1)
    })
    test("if rotate allowed but not upgrade, still does rotate", () => {
      const { entity1, luaEntity1, entity2 } = createUndergroundBeltPair(1, 1)
      // just to forbid upgrade
      createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
        name: "fast-underground-belt",
      })
      luaEntity1.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity1.force,
        direction: oppositedirection(luaEntity1.direction),
      })

      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity1, 1)
      expect(ret).toBe(EntityUpdateResult.CannotUpgradeChangedPair)

      expect(entity1).toMatchTable({
        firstValue: { name: "underground-belt", type: "output" },
        direction: direction.east,
      })
      expect(entity2).toMatchTable({
        firstValue: { name: "underground-belt", type: "input" },
        direction: direction.east,
      })

      assertNEntities(3)
      assertUpdateCalled(entity1, 1, 1, false)
      assertUpdateCalled(entity2, 1, 2, false)
    })
  })
  test("fast replace to upgrade also upgrades pair", () => {
    const { luaEntity1, entity1, entity2 } = createUndergroundBeltPair(1, 1)
    const newEntity = luaEntity1.surface.create_entity({
      name: "fast-underground-belt",
      direction: luaEntity1.direction,
      position: luaEntity1.position,
      force: luaEntity1.force,
      type: luaEntity1.belt_to_ground_type,
      fast_replace: true,
    })!
    expect(newEntity).toBeAny()
    entity1.replaceWorldEntity(1, newEntity)

    const ret = projectUpdates.tryUpdateEntityFromWorld(entity1, 1)
    expect(ret).toBe("updated")

    expect(entity1).toMatchTable({
      firstValue: { name: "fast-underground-belt", type: "input" },
      direction: direction.west,
    })
    expect(entity2).toMatchTable({
      firstValue: { name: "fast-underground-belt", type: "output" },
      direction: direction.west,
    })

    assertNEntities(2)
    assertUpdateCalled(entity1, 1, 1, false)
    assertUpdateCalled(entity2, 1, 2, false)
  })

  test("rotating to fix direction updates all entities", () => {
    const { luaEntity, entity } = createUndergroundBelt(1)
    luaEntity.rotate()
    expect(entity.hasErrorAt(1)).toBe(true)
    luaEntity.rotate()
    expect(entity.hasErrorAt(1)).toBe(false)
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 1)
    expect(ret).toBe(EntityUpdateResult.NoChange)

    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
  test("updating to fix direction updates all entities", () => {
    const { luaEntity, entity } = createUndergroundBelt(1)
    luaEntity.rotate()
    expect(entity.hasErrorAt(1)).toBe(true)
    luaEntity.rotate()
    expect(entity.hasErrorAt(1)).toBe(false)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 1)
    expect(ret).toBe(EntityUpdateResult.NoChange)

    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
  test("upgrade rotating to fix direction applies upgrade and updates entities", () => {
    const { luaEntity, entity } = createUndergroundBelt(1)
    luaEntity.rotate()
    expect(entity.hasErrorAt(1)).toBe(true)

    luaEntity.order_upgrade({
      target: "underground-belt",
      force: luaEntity.force,
      direction: direction.west,
    })
    worldEntityUpdates.updateWorldEntities.invokes((pEntity, stage) => {
      if (entity == pEntity && stage == 1) {
        luaEntity.rotate()
      }
    })

    const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 1)
    expect(ret).toBe(EntityUpdateResult.NoChange)

    expect(luaEntity.direction).toBe(direction.west)
    expect(luaEntity.direction).toBe(entity.direction)

    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })

  test("rotate a broken underground at higher stage fixes underground, if pair is correct", () => {
    const { luaEntity1, entity1, luaEntity2, entity2 } = createUndergroundBeltPair(1, 1)
    entity1.replaceWorldEntity(2, luaEntity1)
    entity2.replaceWorldEntity(2, luaEntity2)

    luaEntity2.rotate()
    expect(entity2.hasErrorAt(2)).toBe(true)
    luaEntity2.rotate()
    expect(entity2.hasErrorAt(2)).toBe(false)

    const ret = projectUpdates.tryRotateEntityFromWorld(entity2, 2)
    expect(ret).toBe(EntityUpdateResult.NoChange)
    assertUpdateCalled(entity2, 1, 1, false)
    assertUpdateCalled(entity1, 1, 2, false)

    assertNEntities(2)
  })
  test.each(["self", "pair"])("rotating a broken underground fixes pair if %s in first stage", (which) => {
    const { luaEntity1, entity1, luaEntity2, entity2 } = createUndergroundBeltPair(
      which == "pair" ? 2 : 1,
      which == "pair" ? 1 : 2,
    )
    entity1.replaceWorldEntity(2, luaEntity1)
    entity2.replaceWorldEntity(2, luaEntity2)
    // break entity2
    entity2.direction = direction.east
    entity2.setTypeProperty("input")
    expect(entity2.hasErrorAt(2)).toBe(true)

    assert(luaEntity2.rotate())

    const ret = projectUpdates.tryRotateEntityFromWorld(entity2, 2)
    expect(ret).toBe(EntityUpdateResult.Updated)

    expect(entity1).toMatchTable({
      direction: direction.east,
      firstValue: { type: "output" },
    })
    expect(entity2).toMatchTable({
      direction: direction.east,
      firstValue: { type: "input" },
    })

    assertUpdateCalled(entity2, entity2.firstStage, 1, false)
    assertUpdateCalled(entity1, entity1.firstStage, 2, false)

    assertNEntities(2)
  })
  test("rotating a broken underground that changes pair disallowed if not first stage", () => {
    const { luaEntity1, entity1, luaEntity2, entity2 } = createUndergroundBeltPair(1, 1)
    entity1.replaceWorldEntity(2, luaEntity1)
    entity2.replaceWorldEntity(2, luaEntity2)
    // break entity2
    entity2.direction = direction.east
    entity2.setTypeProperty("input")
    expect(entity2.hasErrorAt(2)).toBe(true)

    assert(luaEntity2.rotate())

    const ret = projectUpdates.tryRotateEntityFromWorld(entity2, 2)
    expect(ret).toBe(EntityUpdateResult.CannotRotate)
    // assert rotated back
    expect(luaEntity2).toMatchTable({
      direction: direction.west,
      belt_to_ground_type: "output",
    })

    assertNEntities(2)
    assertWUNotCalled()
  })
})

describe("rolling stock", () => {
  let rollingStock: LuaEntity
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    rollingStock = createRollingStock()
  })
  function addEntity() {
    const result = projectUpdates.addNewEntity(rollingStock, 1)
    clearMocks()
    return result
  }
  test("can save rolling stock", () => {
    const result = projectUpdates.addNewEntity(rollingStock, 1)!
    expect(result).toBeAny()
    expect(result.firstValue.name).toBe("locomotive")

    assertNEntities(1)

    const found = project.content.findCompatibleByProps(rollingStock.name, rollingStock.position, nil, 1)!
    expect(found).toBeAny()
    expect(found).toBe(result)

    const foundDirectly = project.content.findCompatibleWithLuaEntity(rollingStock, nil, 1)
    expect(foundDirectly).toBeAny()
    expect(foundDirectly).toBe(found)

    assertNewUpdated(result)
  })

  test("no update on rolling stock", () => {
    const entity = addEntity()!

    projectUpdates.tryUpdateEntityFromWorld(entity, 1)

    assertNEntities(1)
    assertWUNotCalled()
  })
})

describe("trains", () => {
  let entities: LuaEntity[]
  let projectEntities: RollingStockProjectEntity[]
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entities = createRollingStocks(game.surfaces[1], "locomotive", "cargo-wagon", "fluid-wagon")
    projectEntities = entities.map((e) => {
      const aEntity = createProjectEntityNoCopy(
        {
          name: e.name,
          orientation: e.orientation,
        },
        e.position,
        nil,
        1,
      )
      aEntity.replaceWorldEntity(1, e)
      project.content.add(aEntity)
      e.connect_rolling_stock(defines.rail_direction.front)
      return aEntity
    })
  })
  test("resetTrainLocation", () => {
    const anEntity = projectEntities[1]
    projectUpdates.resetTrain(anEntity)

    assertReplaceCalled(projectEntities[0], 1)
    assertReplaceCalled(projectEntities[1], 1)
    assertReplaceCalled(projectEntities[2], 1)
    assertNEntities(3)
  })
  test("setTrainLocationToCurrent", () => {
    entities[0].train!.speed = 10
    after_ticks(10, () => {
      const anEntity = projectEntities[1]
      projectUpdates.setTrainLocationToCurrent(anEntity)

      for (let i = 0; i < 3; i++) {
        expect(projectEntities[i].position).toEqual(entities[i].position)
      }
      assertReplaceCalled(projectEntities[0], 1)
      assertReplaceCalled(projectEntities[1], 1)
      assertReplaceCalled(projectEntities[2], 1)
      assertNEntities(3)
    })
  })
})
