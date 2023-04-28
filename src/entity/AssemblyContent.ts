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

import { oppositedirection } from "util"
import { Prototypes } from "../constants"
import { isEmpty, RegisterClass } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { AssemblyEntity, StageNumber, UndergroundBeltAssemblyEntity } from "./AssemblyEntity"
import {
  CableConnectionPoint,
  getEntityOfConnectionPoint,
  isPowerSwitchConnectionPoint,
  PowerSwitchConnectionPoint,
} from "./cable-connection"
import { AsmCircuitConnection, circuitConnectionEquals } from "./circuit-connection"
import { EntityIdentification } from "./Entity"
import {
  EntityPrototypeInfo,
  getPasteRotatableType,
  isRollingStockType,
  OnEntityPrototypesLoaded,
  PasteCompatibleRotationType,
  rollingStockTypes,
} from "./entity-prototype-info"
import { _migrateMap2DToLinkedList, Map2D, newMap2D } from "./map2d"
import { getRegisteredAssemblyEntity } from "./registration"
import { getUndergroundDirection } from "./underground-belt"

/**
 * A collection of assembly entities: the actual data of an assembly.
 *
 * Also keeps track of info spanning multiple entities (wire/circuit connections).
 */
export interface AssemblyContent {
  has(entity: AssemblyEntity): boolean

  findCompatibleByProps(
    entityName: string,
    position: Position,
    direction: defines.direction | nil,
    stage: StageNumber,
  ): AssemblyEntity | nil
  findCompatibleWithLuaEntity(
    entity: EntityIdentification,
    previousDirection: defines.direction | nil,
    stage: StageNumber,
  ): AssemblyEntity | nil
  findCompatibleWithExistingEntity(entity: AssemblyEntity, stage: StageNumber): AssemblyEntity | nil

  findExact(entity: LuaEntity, position: Position, stage: StageNumber): AssemblyEntity | nil

  findCompatibleFromPreview(previewEntity: LuaEntity, stage: StageNumber): AssemblyEntity | nil
  findCompatibleFromLuaEntityOrPreview(entity: LuaEntity, stage: StageNumber): AssemblyEntity | nil

  getCircuitConnections(entity: AssemblyEntity): AsmEntityCircuitConnections | nil
  getCableConnections(entity: CableConnectionPoint): AsmEntityCableConnections | nil

  countNumEntities(): number
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity>

  /**
   * Will return slightly larger than actual
   */
  computeBoundingBox(): BoundingBox | nil
}

export const enum CableAddResult {
  Added = "Added",
  Error = "Error",
  AlreadyExists = "AlreadyExists",
  MaxConnectionsReached = "MaxConnectionsReached",
}
const MaxCableConnections = 5 // hard-coded in game

export interface MutableAssemblyContent extends AssemblyContent {
  add(entity: AssemblyEntity): void
  delete(entity: AssemblyEntity): void

  changePosition(entity: AssemblyEntity, position: Position): boolean

  /** Returns if connection was successfully added. */
  addCircuitConnection(circuitConnection: AsmCircuitConnection): boolean
  removeCircuitConnection(circuitConnection: AsmCircuitConnection): void

  addCableConnection(point1: CableConnectionPoint, point2: CableConnectionPoint): CableAddResult
  removeCableConnection(point1: CableConnectionPoint, point2: CableConnectionPoint): void

  /** Modifies all entities */
  insertStage(stageNumber: StageNumber): void
  deleteStage(stageNumber: StageNumber): void
}

export type AsmEntityCircuitConnections = LuaMap<AssemblyEntity, LuaSet<AsmCircuitConnection>>
export type AsmEntityCableConnections = LuaSet<CableConnectionPoint>

let nameToType: EntityPrototypeInfo["nameToType"]
let nameToCategory: EntityPrototypeInfo["nameToCategory"]
OnEntityPrototypesLoaded.addListener((i) => {
  ;({ nameToType, nameToCategory } = i)
})

type PowerSwitchConnectionPointKey = PowerSwitchConnectionPoint & { _isKey: never }
type ConnectionPointKey = AssemblyEntity | PowerSwitchConnectionPointKey

@RegisterClass("EntityMap")
class AssemblyContentImpl implements MutableAssemblyContent {
  readonly byPosition: Map2D<AssemblyEntity> = newMap2D()
  entities = new LuaSet<AssemblyEntity>()
  circuitConnections = new LuaMap<AssemblyEntity, AsmEntityCircuitConnections>()
  cableConnections = new LuaMap<ConnectionPointKey, AsmEntityCableConnections>()
  // currently only used for power switches
  extraCableConnectionPoints?: LuaMap<AssemblyEntity, Record<any, PowerSwitchConnectionPointKey>>

  has(entity: AssemblyEntity): boolean {
    return this.entities.has(entity)
  }

  findCompatibleByProps(
    entityName: string,
    position: Position,
    direction: defines.direction | nil,
    stage: StageNumber,
  ): AssemblyEntity | nil {
    const { x, y } = position
    let cur = this.byPosition.get(x, y)
    if (!cur) return
    const category = nameToCategory.get(entityName)

    let candidate: AssemblyEntity | nil = nil
    // out of possible candidates, find one with the smallest firstStage

    while (cur != nil) {
      if (
        (direction == nil || direction == (cur.direction ?? 0)) &&
        (cur.lastStage == nil || cur.lastStage >= stage) &&
        (cur.firstValue.name == entityName || (category && nameToCategory.get(cur.firstValue.name) == category)) &&
        (candidate == nil || cur.firstStage < candidate.firstStage)
      ) {
        candidate = cur
      }
      cur = cur._next
    }
    return candidate
  }
  findCompatibleWithLuaEntity(
    entity: EntityIdentification,
    previousDirection: defines.direction | nil,
    stage: StageNumber,
  ): AssemblyEntity | nil {
    const type = entity.type
    if (type == "underground-belt") {
      const found = this.findCompatibleByProps(type, entity.position, nil, stage)
      if (
        found &&
        getUndergroundDirection(found.getDirection(), (found as UndergroundBeltAssemblyEntity).firstValue.type) ==
          getUndergroundDirection(entity.direction, entity.belt_to_ground_type)
      )
        return found
      return nil
    } else if (rollingStockTypes.has(type)) {
      if (entity.object_name == "LuaEntity") {
        const registered = getRegisteredAssemblyEntity(entity as LuaEntity)
        if (registered && this.entities.has(registered)) return registered
      }
      return nil
    }
    // now, worldDirection == savedDirection
    const name = entity.name
    const pasteRotatableType = getPasteRotatableType(name)
    if (pasteRotatableType == nil) {
      return this.findCompatibleByProps(name, entity.position, previousDirection ?? entity.direction, stage)
    }
    if (pasteRotatableType == PasteCompatibleRotationType.AnyDirection) {
      return this.findCompatibleByProps(name, entity.position, nil, stage)
    }
    if (pasteRotatableType == PasteCompatibleRotationType.Flippable) {
      const direction = previousDirection ?? entity.direction
      const position = entity.position
      if (direction % 2 == 1) {
        // if diagonal, we _do_ care about the direction
        return this.findCompatibleByProps(name, position, direction, stage)
      }
      return (
        this.findCompatibleByProps(name, position, direction, stage) ??
        this.findCompatibleByProps(name, position, oppositedirection(direction), stage)
      )
    }
  }

  findCompatibleWithExistingEntity(entity: AssemblyEntity, stage: StageNumber): AssemblyEntity | nil {
    const name = entity.firstValue.name
    return this.findCompatibleWithLuaEntity(
      {
        name,
        type: nameToType.get(name) ?? "unknown",
        position: entity.position,
        direction: entity.getDirection(),
        belt_to_ground_type: entity.isUndergroundBelt() ? entity.firstValue.type : nil,
      },
      nil,
      stage,
    )
  }

  findCompatibleFromPreview(previewEntity: LuaEntity, stage: StageNumber): AssemblyEntity | nil {
    const actualName = previewEntity.name.substring(Prototypes.PreviewEntityPrefix.length)
    const direction = isRollingStockType(actualName) ? 0 : previewEntity.direction
    return this.findCompatibleByProps(actualName, previewEntity.position, direction, stage)
  }

  findCompatibleFromLuaEntityOrPreview(entity: LuaEntity, stage: StageNumber): AssemblyEntity | nil {
    const name = entity.name
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) {
      return this.findCompatibleFromPreview(entity, stage)
    }
    return this.findCompatibleWithLuaEntity(entity, nil, stage)
  }

  findExact(entity: LuaEntity, position: Position, stage: StageNumber): AssemblyEntity | nil {
    let cur = this.byPosition.get(position.x, position.y)
    while (cur != nil) {
      if (cur.getWorldOrPreviewEntity(stage) == entity) return cur
      cur = cur._next
    }
    return nil
  }

  countNumEntities(): number {
    return table_size(this.entities)
  }
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity> {
    return this.entities
  }

  computeBoundingBox(): BoundingBox | nil {
    if (isEmpty(this.entities)) return nil
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const entity of this.entities) {
      const { x, y } = entity.position
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    return BBox.expand(BBox.coords(minX, minY, maxX, maxY), 20)
  }

  add(entity: AssemblyEntity): void {
    const { entities } = this
    if (entities.has(entity)) return
    entities.add(entity)
    const { x, y } = entity.position
    this.byPosition.add(x, y, entity)
  }

  delete(entity: AssemblyEntity): void {
    const { entities } = this
    if (!entities.has(entity)) return
    entities.delete(entity)
    const { x, y } = entity.position
    this.byPosition.delete(x, y, entity)

    this.removeAllConnections(entity, this.circuitConnections)
    this.removeAllConnections(entity, this.cableConnections)
    const extraPoints = this.extraCableConnectionPoints?.get(entity)
    if (extraPoints) {
      for (const [, point] of pairs(extraPoints)) {
        this.removeAllConnections(point, this.cableConnections)
      }
      this.extraCableConnectionPoints!.delete(entity)
    }
  }

  changePosition(entity: AssemblyEntity, position: Position): boolean {
    if (!this.entities.has(entity)) return false
    const { x, y } = entity.position
    const { x: newX, y: newY } = position
    if (x == newX && y == newY) return false
    const { byPosition } = this
    byPosition.delete(x, y, entity)
    entity.setPositionUnchecked(position)
    byPosition.add(newX, newY, entity)
    return true
  }

  private removeAllConnections(entity: AssemblyEntity, map: LuaMap<AssemblyEntity, AsmEntityCircuitConnections>): void
  private removeAllConnections(
    entity: ConnectionPointKey,
    map: LuaMap<ConnectionPointKey, AsmEntityCableConnections>,
  ): void
  private removeAllConnections(
    key: CableConnectionPoint,
    map: LuaMap<any, AsmEntityCableConnections> | LuaMap<any, AsmEntityCircuitConnections>,
  ) {
    const entityData = map.get(key)
    if (!entityData) return
    map.delete(key)

    for (const otherKey of entityData as LuaSet<ConnectionPointKey>) {
      const otherData = map.get(otherKey)
      if (otherData) {
        otherData.delete(key as any)
        if (isEmpty(otherData)) map.delete(otherKey)
      }
    }
  }

  getCircuitConnections(entity: AssemblyEntity): AsmEntityCircuitConnections | nil {
    return this.circuitConnections.get(entity)
  }
  addCircuitConnection(circuitConnection: AsmCircuitConnection): boolean {
    const { entities, circuitConnections } = this
    const { fromEntity, toEntity } = circuitConnection
    if (!entities.has(fromEntity) || !entities.has(toEntity)) return false

    let fromConnections = circuitConnections.get(fromEntity)

    if (fromConnections) {
      const fromSet = fromConnections.get(toEntity)
      if (fromSet) {
        for (const otherConnection of fromSet) {
          if (circuitConnectionEquals(circuitConnection, otherConnection)) {
            return false
          }
        }
      }
    }

    if (!fromConnections) {
      fromConnections = new LuaMap()
      circuitConnections.set(fromEntity, fromConnections)
    }

    let toConnections = circuitConnections.get(toEntity)
    if (!toConnections) {
      toConnections = new LuaMap()
      circuitConnections.set(toEntity, toConnections)
    }

    const fromSet = fromConnections.get(toEntity),
      toSet = toConnections.get(fromEntity)

    if (fromSet) {
      fromSet.add(circuitConnection)
    } else {
      fromConnections.set(toEntity, newLuaSet(circuitConnection))
    }
    if (toSet) {
      toSet.add(circuitConnection)
    } else {
      toConnections.set(fromEntity, newLuaSet(circuitConnection))
    }
    return true
  }

  removeCircuitConnection(circuitConnection: AsmCircuitConnection): void {
    const { circuitConnections } = this
    const { fromEntity, toEntity } = circuitConnection

    const fromConnections = circuitConnections.get(fromEntity),
      toConnections = circuitConnections.get(toEntity)
    if (!fromConnections || !toConnections) return
    const fromSet = fromConnections.get(toEntity)
    if (fromSet) {
      fromSet.delete(circuitConnection)
      if (isEmpty(fromSet)) {
        fromConnections.delete(toEntity)
        if (isEmpty(fromConnections)) {
          circuitConnections.delete(fromEntity)
        }
      }
    }
    const toSet = toConnections.get(fromEntity)
    if (toSet) {
      toSet.delete(circuitConnection)
      if (isEmpty(toSet)) {
        toConnections.delete(fromEntity)
        if (isEmpty(toConnections)) {
          circuitConnections.delete(toEntity)
        }
      }
    }
  }

  getCableConnections(entity: CableConnectionPoint): AsmEntityCableConnections | nil {
    const key = this.getConnectionPointKey(entity)
    return key && this.cableConnections.get(key)
  }

  getConnectionPointKey(point: CableConnectionPoint, createIfAbsent: true): ConnectionPointKey
  getConnectionPointKey(point: CableConnectionPoint): ConnectionPointKey | nil
  getConnectionPointKey(point: CableConnectionPoint, createIfAbsent?: true): ConnectionPointKey | nil {
    if (!isPowerSwitchConnectionPoint(point)) {
      return point
    }
    const map = (this.extraCableConnectionPoints ??= new LuaMap())
    let thisEntity = map.get(point.entity)
    if (!thisEntity) {
      if (!createIfAbsent) return nil
      thisEntity = {}
      map.set(point.entity, thisEntity)
    }
    const existing = thisEntity[point.connectionId]
    if (existing != nil) return existing
    if (!createIfAbsent) return nil
    return (thisEntity[point.connectionId] = point as PowerSwitchConnectionPointKey)
  }

  addCableConnection(_point1: CableConnectionPoint, _point2: CableConnectionPoint): CableAddResult {
    const { entities, cableConnections } = this
    const entity1 = getEntityOfConnectionPoint(_point1),
      entity2 = getEntityOfConnectionPoint(_point2)
    if (entity1 == entity2) return CableAddResult.Error
    if (!entities.has(entity1) || !entities.has(entity2)) return CableAddResult.Error
    const key1 = this.getConnectionPointKey(_point1, true),
      key2 = this.getConnectionPointKey(_point2, true)

    let data1 = cableConnections.get(key1)
    let data2 = cableConnections.get(key2)

    if (data1) {
      if (data1.has(key2)) return CableAddResult.AlreadyExists
      if (table_size(data1) >= MaxCableConnections) return CableAddResult.MaxConnectionsReached
    }
    if (data2) {
      if (data2.has(key1)) return CableAddResult.AlreadyExists
      if (table_size(data2) >= MaxCableConnections) return CableAddResult.MaxConnectionsReached
    }

    if (data1 && isPowerSwitchConnectionPoint(_point1)) {
      this.removeCableConnection(next(data1)[0], key1)
      data1 = cableConnections.get(key1)
    }
    if (data2 && isPowerSwitchConnectionPoint(_point2)) {
      this.removeCableConnection(next(data2)[0], key2)
      data2 = cableConnections.get(key2)
    }

    if (data1) {
      data1.add(key2)
    } else {
      data1 = newLuaSet<CableConnectionPoint>(key2)
      cableConnections.set(key1, data1)
    }

    if (data2) {
      data2.add(key1)
    } else {
      data2 = newLuaSet<CableConnectionPoint>(key1)
      cableConnections.set(key2, data2)
    }

    return CableAddResult.Added
  }

  removeCableConnection(_point1: CableConnectionPoint, _point2: CableConnectionPoint): void {
    const entity1 = getEntityOfConnectionPoint(_point1),
      entity2 = getEntityOfConnectionPoint(_point2)
    const { cableConnections, entities } = this
    if (entity1 == entity2 || !entities.has(entity1) || !entities.has(entity2)) return

    const key1 = this.getConnectionPointKey(_point1),
      key2 = this.getConnectionPointKey(_point2)
    if (!key1 || !key2) return

    const data1 = cableConnections.get(key1)
    if (data1) {
      data1.delete(key2)
      if (isEmpty(data1)) {
        cableConnections.delete(key1)
      }
    }
    const data2 = cableConnections.get(key2)
    if (data2) {
      data2.delete(key1)
      if (isEmpty(data2)) {
        cableConnections.delete(key2)
      }
    }
  }

  insertStage(stageNumber: StageNumber): void {
    for (const entity of this.entities) {
      entity.insertStage(stageNumber)
    }
  }
  deleteStage(stageNumber: StageNumber): void {
    for (const entity of this.entities) {
      entity.deleteStage(stageNumber)
    }
  }

  __tostring(): string {
    return `AssemblyContent(${this.countNumEntities()} entities)`
  }
}
export function _assertCorrect(content: AssemblyContent): void {
  assume<AssemblyContentImpl>(content)
  const { entities } = content
  for (const [entity, points] of content.circuitConnections) {
    assert(entities.has(entity))

    for (const [otherEntity, connections] of points) {
      assert(entities.has(otherEntity))
      for (const connection of connections) {
        assert(content.circuitConnections.get(otherEntity)!.get(entity)!.has(connection))
      }
    }
  }

  for (const [point, connections] of content.cableConnections) {
    const entity = getEntityOfConnectionPoint(point)
    if (isPowerSwitchConnectionPoint(point)) {
      assert(content.getConnectionPointKey(point) != nil)
    }
    assert(entities.has(entity))

    for (const otherPoint of connections) {
      const otherEntity = getEntityOfConnectionPoint(otherPoint)
      if (isPowerSwitchConnectionPoint(otherPoint)) {
        assert(content.getConnectionPointKey(otherPoint) != nil)
      }
      assert(entities.has(otherEntity))
      assert(content.cableConnections.get(otherPoint as ConnectionPointKey)!.has(point))
    }
  }

  if (content.extraCableConnectionPoints) {
    for (const [entity, points] of content.extraCableConnectionPoints) {
      assert(entities.has(entity))
      for (const [connectionId, point] of pairs(points)) {
        assert(isPowerSwitchConnectionPoint(point))
        assert(content.getConnectionPointKey(point) != nil)
        assert(point.connectionId == connectionId)
      }
    }
  }
}

export function newAssemblyContent(): MutableAssemblyContent {
  return new AssemblyContentImpl()
}

export function _migrateAssemblyContent_0_18_0(content: MutableAssemblyContent): void {
  _migrateMap2DToLinkedList((content as AssemblyContentImpl).byPosition)
}
