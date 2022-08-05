/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { isEmpty, mutableShallowCopy, Owned, ownedShallowCopy, PRecord, PRRecord, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { applyDiffToDiff, applyDiffToEntity, getEntityDiff, LayerDiff } from "./diff"
import { AnyWorldEntity, Entity, EntityPose, WorldEntityType, WorldEntityTypes } from "./Entity"

export type LayerNumber = number

export interface AssemblyEntity<out T extends Entity = Entity> extends EntityPose {
  readonly categoryName: string
  direction: defines.direction | nil
  /** If this entity is a lost reference */
  isLostReference?: true

  getBaseLayer(): LayerNumber
  getBaseValue(): Readonly<T>

  /** Applies a diff at a given layer. */
  applyDiffAtLayer(layer: LayerNumber, diff: LayerDiff<T>): void
  /** @return if this entity has any changes after the first layer. */
  hasLayerChanges(): boolean
  _getLayerChanges(): LayerChanges<T>

  /** @return the value at a given layer. Nil if below the first layer. The result is a new table. */
  getValueAtLayer(layer: LayerNumber): Owned<T> | nil
  /**
   * Iterates the values of layers in the given range. More efficient than repeated calls to getValueAtLayer.
   * The same instance will be returned for each layer; It should be treated as a temporary read-only view.
   */
  iterateValues(start: LayerNumber, end: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, Readonly<T>]>>

  /** Moves the entity to a lower layer. */
  moveDown(lowerLayer: LayerNumber): LayerNumber
  /**
   * Moves an entity to a lower layer.
   * @param lowerLayer
   * @param newValue The value to set at the new layer.
   * @param createDiffAtOldLayer If a diff should be created at the old layer, so that the value at the old layer remains unchanged.
   * @return The old layer number.
   */
  moveDown(lowerLayer: LayerNumber, newValue: T, createDiffAtOldLayer?: boolean): LayerNumber
  /**
   * Move the entity to a higher layer
   * All layer changes from the old layer to the new layer will be applied (and then removed).
   */
  moveUp(higherLayer: LayerNumber): LayerNumber

  moveToLayer(layer: LayerNumber): void

  /** Returns nil if world entity does not exist or is invalid */
  getWorldEntity(layer: LayerNumber): LuaEntity | nil
  getWorldEntity<T extends WorldEntityType>(layer: LayerNumber, type: T): WorldEntityTypes[T] | nil
  /** Destroys the old world entity, if exists. If `entity` is not nil, sets the new world entity. */
  replaceWorldEntity(layer: LayerNumber, entity: LuaEntity | nil): void
  replaceWorldEntity<T extends WorldEntityType>(layer: LayerNumber, entity: WorldEntityTypes[T] | nil, type: T): void
  hasAnyWorldEntity(type: WorldEntityType): boolean

  destroyAllWorldEntities(type: WorldEntityType): void
  /** Iterates all valid world entities. May skip layers. */
  iterateWorldEntities<T extends WorldEntityType>(
    type: T,
  ): LuaIterable<LuaMultiReturn<[LayerNumber, WorldEntityTypes[T]]>>
}

export type LayerChanges<E extends Entity = Entity> = PRRecord<LayerNumber, LayerDiff<E>>

@RegisterClass("AssemblyEntity")
class AssemblyEntityImpl<T extends Entity = Entity> implements AssemblyEntity<T> {
  public readonly categoryName: string
  public readonly position: Position
  public direction: defines.direction | nil

  public isLostReference?: true

  private baseLayer: LayerNumber
  private baseValue: Owned<T>
  private readonly layerChanges: PRecord<LayerNumber, Owned<LayerDiff<T>>> = {}

  private readonly worldEntities: PRecord<WorldEntityType, PRecord<LayerNumber, AnyWorldEntity>> = {}

  constructor(baseLayer: LayerNumber, baseEntity: T, position: Position, direction: defines.direction | nil) {
    this.categoryName = getCategoryName(baseEntity)
    this.position = position
    this.direction = direction === 0 ? nil : direction
    this.baseValue = ownedShallowCopy(baseEntity)
    this.baseLayer = baseLayer
  }

  getBaseLayer(): LayerNumber {
    return this.baseLayer
  }
  getBaseValue(): T {
    return this.baseValue
  }

  applyDiffAtLayer(layer: LayerNumber, diff: LayerDiff<T>): void {
    const { baseLayer, layerChanges } = this
    assert(layer >= baseLayer, "layer must be >= first layer")
    if (layer === baseLayer) {
      applyDiffToEntity(this.baseValue, diff)
      return
    }
    const existingDiff = layerChanges[layer]
    if (existingDiff) {
      applyDiffToDiff(existingDiff, diff)
    } else {
      layerChanges[layer] = ownedShallowCopy(diff)
    }
  }
  hasLayerChanges(): boolean {
    return next(this.layerChanges)[0] !== nil
  }
  _getLayerChanges(): LayerChanges<T> {
    return this.layerChanges
  }

  getValueAtLayer(layer: LayerNumber): Owned<T> | nil {
    assert(layer >= 1, "layer must be >= 1")
    if (layer < this.baseLayer) return nil
    const value = mutableShallowCopy(this.baseValue)
    for (const [changedLayer, diff] of pairs(this.layerChanges)) {
      if (changedLayer > layer) break
      applyDiffToEntity(value, diff)
    }
    return value
  }
  iterateValues(start: LayerNumber, end: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, T]>>
  iterateValues(start: LayerNumber, end: LayerNumber) {
    const value = this.getValueAtLayer(start)!
    function next(layerValues: LayerChanges, prevLayer: LayerNumber | nil) {
      if (!prevLayer) return $multi(start, value)
      const nextLayer = prevLayer + 1
      if (nextLayer > end) return $multi()
      const diff = layerValues[nextLayer]
      if (diff) applyDiffToEntity(value, diff)
      return $multi(nextLayer, value)
    }
    return $multi<any>(next, this.layerChanges, nil)
  }

  moveDown(lowerLayer: LayerNumber, newValue?: T, createDiffAtOldLayer?: boolean): LayerNumber {
    const { baseLayer: higherLayer, baseValue: higherValue } = this
    assert(lowerLayer < higherLayer, "new layer number must be greater than old layer number")
    const lowerValue = newValue ? ownedShallowCopy(newValue) : higherValue
    this.baseLayer = lowerLayer
    this.baseValue = lowerValue
    const newDiff = createDiffAtOldLayer ? getEntityDiff(lowerValue, higherValue) : nil
    this.layerChanges[higherLayer] = newDiff
    return higherLayer
  }
  moveUp(higherLayer: LayerNumber): LayerNumber {
    const { baseLayer: lowerLayer, baseValue } = this
    assert(higherLayer > lowerLayer, "new layer number must be greater than old layer number")
    const { layerChanges } = this
    for (const [changeLayer, changed] of pairs(layerChanges)) {
      if (changeLayer > higherLayer) break
      applyDiffToEntity(baseValue, changed)
      layerChanges[changeLayer] = nil
    }
    this.baseLayer = higherLayer
    return lowerLayer
  }
  moveToLayer(layer: LayerNumber): void {
    const { baseLayer } = this
    if (layer > baseLayer) {
      this.moveUp(layer)
    } else if (layer < baseLayer) {
      this.moveDown(layer)
    }
    // else do nothing
  }

  getWorldEntity(layer: LayerNumber, type: WorldEntityType = "main") {
    const byType = this.worldEntities[type]
    if (!byType) return nil
    const worldEntity = byType[layer]
    if (worldEntity && worldEntity.valid) {
      return worldEntity as LuaEntity
    }
    // delete
    delete byType[layer]
    if (isEmpty(byType)) delete this.worldEntities[type]
  }
  replaceWorldEntity(layer: LayerNumber, entity: AnyWorldEntity | nil, type: WorldEntityType = "main"): void {
    const { worldEntities } = this
    const byType = worldEntities[type] || (worldEntities[type] = {})
    const existing = byType[layer]
    if (existing && existing.valid && existing !== entity) existing.destroy()
    byType[layer] = entity
    if (isEmpty(byType)) delete worldEntities[type]
  }
  hasAnyWorldEntity(type: WorldEntityType): boolean {
    const { worldEntities } = this
    const byType = worldEntities[type]
    if (!byType) return false
    for (const [key, entity] of pairs(byType)) {
      if (entity && entity.valid) return true
      byType[key] = nil
    }
    if (isEmpty(byType)) delete worldEntities[type]
    return false
  }
  destroyAllWorldEntities(type: WorldEntityType): void {
    const { worldEntities } = this
    const byType = worldEntities[type]
    if (!byType) return
    for (const [, entity] of pairs(byType)) {
      if (entity && entity.valid) entity.destroy()
    }
    delete worldEntities[type]
  }
  iterateWorldEntities(type: WorldEntityType): LuaIterable<LuaMultiReturn<[LayerNumber, any]>> {
    const byType = this.worldEntities[type]
    if (!byType) return (() => nil) as any
    let curKey = next(byType)[0]
    return function () {
      while (true) {
        const key = curKey
        if (!key) return nil
        curKey = next(byType, key)[0]
        const entity = byType[key]!
        if (entity.valid) return $multi(key, entity)
      }
    } as any
  }
}

export function createAssemblyEntity<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction | nil,
  layerNumber: LayerNumber,
): AssemblyEntity<E> {
  return new AssemblyEntityImpl(layerNumber, entity, position, direction)
}

export function getCategoryName(entity: Entity): string {
  // todo: group into categories
  return entity.name
}

export function isWorldEntityAssemblyEntity(luaEntity: LuaEntity): boolean {
  return luaEntity.is_entity_with_owner && luaEntity.has_flag("player-creation")
}

/** Does not check position */
export function isCompatibleEntity(
  a: AssemblyEntity,
  categoryName: string,
  direction: defines.direction | nil,
): boolean {
  return a.categoryName === categoryName && a.direction === direction
}
