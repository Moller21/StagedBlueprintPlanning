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

import { BlueprintEntity, LuaEntity } from "factorio:runtime"
import { maybeSetEmptyControlBehavior } from "../entity/empty-control-behavior"
import { Entity } from "../entity/Entity"
import { areUpgradeableTypes } from "../entity/entity-prototype-info"
import {
  createProjectEntityNoCopy,
  InserterProjectEntity,
  LoaderProjectEntity,
  ProjectEntity,
  RollingStockProjectEntity,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../entity/ProjectEntity"
import { canBeAnyDirection, forceFlipUnderground, saveEntity } from "../entity/save-load"
import { findUndergroundPair } from "../entity/underground-belt"
import { saveWireConnections } from "../entity/wires"
import { Project } from "./ProjectDef"
import { WorldEntityUpdates } from "./world-entity-updates"
import { Pos } from "../lib/geometry/position"
import min = math.min

export declare const enum EntityUpdateResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotRotate = "cannot-rotate",
  CannotUpgradeChangedPair = "cannot-upgrade-changed-pair",
}

export declare const enum WireUpdateResult {
  Updated = "updated",
  NoChange = "no-change",
  MaxConnectionsExceeded = "max-connections-exceeded",
}

export declare const enum StageMoveResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotMovePastLastStage = "cannot-move-past-last-stage",
  CannotMoveBeforeFirstStage = "cannot-move-before-first-stage",
  IntersectsAnotherEntity = "intersects-another-entity",
}

/** @noSelf */
export interface ProjectUpdates {
  addNewEntity(entity: LuaEntity, stage: StageNumber, knownValue?: BlueprintEntity): ProjectEntity | nil

  deleteEntityOrCreateSettingsRemnant(entity: ProjectEntity): void
  forceDeleteEntity(entity: ProjectEntity): void

  tryReviveSettingsRemnant(entity: ProjectEntity, stage: StageNumber): StageMoveResult

  tryUpdateEntityFromWorld(entity: ProjectEntity, stage: StageNumber, knownValue?: BlueprintEntity): EntityUpdateResult
  tryRotateEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult
  tryUpgradeEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult
  updateWiresFromWorld(entity: ProjectEntity, stage: StageNumber): WireUpdateResult

  trySetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult
  trySetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult

  resetProp<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean
  movePropDown<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean
  resetAllProps(entity: ProjectEntity, stage: StageNumber): boolean
  moveAllPropsDown(entity: ProjectEntity, stage: StageNumber): boolean

  resetTrain(entity: RollingStockProjectEntity): void
  setTrainLocationToCurrent(entity: RollingStockProjectEntity): void
}

export function ProjectUpdates(project: Project, worldEntityUpdates: WorldEntityUpdates): ProjectUpdates {
  const content = project.content

  const {
    deleteWorldEntities,
    makeSettingsRemnant,
    rebuildWorldEntityAtStage,
    refreshWorldEntityAtStage,
    resetUnderground,
    reviveSettingsRemnant,
    updateNewWorldEntitiesWithoutWires,
    updateWireConnections,
    updateWorldEntities,
    updateWorldEntitiesOnLastStageChanged,
    updateAllHighlights,
  } = worldEntityUpdates

  return {
    addNewEntity,
    deleteEntityOrCreateSettingsRemnant,
    forceDeleteEntity,
    tryReviveSettingsRemnant,
    tryUpdateEntityFromWorld,
    tryRotateEntityFromWorld,
    tryUpgradeEntityFromWorld,
    updateWiresFromWorld,
    trySetFirstStage,
    trySetLastStage,
    resetProp,
    movePropDown,
    resetAllProps,
    moveAllPropsDown,
    resetTrain,
    setTrainLocationToCurrent,
  }

  function fixNewUndergroundBelt(
    projectEntity: ProjectEntity,
    entity: LuaEntity,
    stage: StageNumber,
    knownValue: BlueprintEntity | nil,
  ): void {
    if (entity.type != "underground-belt") return
    assume<UndergroundBeltProjectEntity>(projectEntity)
    if (knownValue) {
      // if blueprint paste, always respect REAL direction in case of flip
      projectEntity.setTypeProperty(entity.belt_to_ground_type)
    }
    const pair = findUndergroundPair(content, projectEntity, stage)
    if (pair) {
      const expectedType = pair.firstValue.type == "output" ? "input" : "output"
      if (expectedType != projectEntity.firstValue.type) {
        projectEntity.setTypeProperty(expectedType)
        projectEntity.direction = pair.direction
      }
    }
  }
  function addNewEntity(entity: LuaEntity, stage: StageNumber, knownValue?: BlueprintEntity): ProjectEntity<any> | nil {
    const saved = saveEntity(entity, knownValue)
    if (!saved) return nil
    const { content } = project
    const projectEntity = createProjectEntityNoCopy(saved, entity.position, entity.direction, stage)
    projectEntity.replaceWorldEntity(stage, entity)
    content.add(projectEntity)

    fixNewUndergroundBelt(projectEntity, entity, stage, knownValue)

    updateNewWorldEntitiesWithoutWires(projectEntity)
    const [hasDiff, , additionalToUpdate] = saveWireConnections(
      content,
      projectEntity,
      stage,
      project.lastStageFor(projectEntity),
    )
    if (hasDiff) {
      updateWireConnections(projectEntity)
      if (additionalToUpdate) {
        for (const otherEntity of additionalToUpdate) {
          updateWireConnections(otherEntity)
        }
      }
    }

    return projectEntity
  }

  function shouldMakeSettingsRemnant(entity: ProjectEntity) {
    if (entity.hasStageDiff()) return true
    const connections = content.getCircuitConnections(entity)
    if (!connections) return false
    const stage = entity.firstStage
    for (const [otherEntity] of connections) {
      if (otherEntity.getWorldEntity(stage) == nil) {
        // has a connection at the first stage, but not one in the world
        return true
      }
    }
    return false
  }

  function deleteEntityOrCreateSettingsRemnant(entity: ProjectEntity): void {
    if (shouldMakeSettingsRemnant(entity)) {
      entity.isSettingsRemnant = true
      makeSettingsRemnant(entity)
    } else {
      content.delete(entity)
      deleteWorldEntities(entity)
    }
  }
  function forceDeleteEntity(entity: ProjectEntity): void {
    content.delete(entity)
    deleteWorldEntities(entity)
  }

  function tryReviveSettingsRemnant(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    if (!entity.isSettingsRemnant) return StageMoveResult.NoChange
    const result = checkCanSetFirstStage(entity, stage)
    if (result == StageMoveResult.Updated || result == StageMoveResult.NoChange) {
      entity.setFirstStageUnchecked(stage)
      entity.isSettingsRemnant = nil
      reviveSettingsRemnant(entity)
    }
    return result
  }

  function applyValueFromWorld(
    stage: StageNumber,
    entity: ProjectEntity,
    entitySource: LuaEntity,
    knownValue?: BlueprintEntity,
  ): boolean {
    const newValue = saveEntity(entitySource, knownValue)
    return newValue != nil && entity.adjustValueAtStage(stage, newValue)
  }

  function tryUpdateEntityFromWorld(
    entity: ProjectEntity,
    stage: StageNumber,
    knownValue?: BlueprintEntity,
  ): EntityUpdateResult {
    const entitySource = entity.getWorldEntity(stage)
    if (!entitySource) return EntityUpdateResult.NoChange
    return handleUpdate(entity, entitySource, stage, entitySource.direction, nil, true, knownValue)
  }

  function tryRotateEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    const entitySource = entity.getWorldEntity(stage)
    if (!entitySource) return EntityUpdateResult.NoChange
    return handleUpdate(entity, entitySource, stage, entitySource.direction, nil, false, nil)
  }

  function checkUpgradeType(existing: ProjectEntity, upgradeType: string): void {
    if (!areUpgradeableTypes(existing.firstValue.name, upgradeType))
      error(` incompatible upgrade from ${existing.firstValue.name} to ${upgradeType}`)
  }

  function tryUpgradeEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    const entitySource = entity.getWorldEntity(stage)
    if (!entitySource) return EntityUpdateResult.NoChange

    const overrideUpgradeTarget = entitySource.get_upgrade_target()?.name
    return handleUpdate(
      entity,
      entitySource,
      stage,
      entitySource.get_upgrade_direction(),
      overrideUpgradeTarget,
      false,
      nil,
    )
  }

  function handleUpdate(
    entity: ProjectEntity,
    entitySource: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: string | nil,
    getBpValue: boolean,
    knownBpValue: BlueprintEntity | nil,
  ): EntityUpdateResult {
    if (entity.isUndergroundBelt()) {
      return handleUndergroundBeltUpdate(
        entity,
        entitySource,
        stage,
        targetDirection,
        targetUpgrade ?? knownBpValue?.name ?? entitySource.name,
      )
    }

    const rotated = targetDirection && targetDirection != entity.direction && !canBeAnyDirection(entitySource)
    if (rotated) {
      const rotateAllowed = stage == entity.firstStage
      if (rotateAllowed) {
        entity.direction = targetDirection
        const entityType = entitySource.type
        if (entityType == "loader" || entityType == "loader-1x1") {
          assume<LoaderProjectEntity>(entity)
          entity.setTypeProperty(entitySource.loader_type)
        } else if (entityType == "inserter") {
          assume<InserterProjectEntity>(entity)
          // also update pickup and drop positions
          // Need a relative position when setting the positions, but we only get an absolute when retrieving them from
          // the source, so we need to translate them
          if (entity.firstValue.pickup_position)
            entity.setPickupPosition(Pos.minus(entitySource.pickup_position, entitySource.position))
          if (entity.firstValue.drop_position)
            entity.setDropPosition(Pos.minus(entitySource.drop_position, entitySource.position))
        }
      } else {
        refreshWorldEntityAtStage(entity, stage)
        return EntityUpdateResult.CannotRotate
      }
    }
    let hasDiff = false
    if (getBpValue && applyValueFromWorld(stage, entity, entitySource, knownBpValue)) {
      hasDiff = true
    } else if (targetUpgrade) {
      checkUpgradeType(entity, targetUpgrade)
      if (entity.applyUpgradeAtStage(stage, targetUpgrade)) {
        hasDiff = true
      }
    }
    if (rotated || hasDiff) {
      updateWorldEntities(entity, stage)
      return EntityUpdateResult.Updated
    }
    return EntityUpdateResult.NoChange
  }

  function updatePair(
    entity1: UndergroundBeltProjectEntity,
    entity1Stage: StageNumber,
    entity2: UndergroundBeltProjectEntity,
    entity2Stage: StageNumber,
  ) {
    // delay updating of highlights, since both pairs might need to be rotated together to avoid errors
    updateWorldEntities(entity1, entity1Stage, false)
    updateWorldEntities(entity2, entity2Stage, false)
    updateAllHighlights(entity1)
    updateAllHighlights(entity2)
  }

  function handleUndergroundFlippedBack(
    entity: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction,
    pair: UndergroundBeltProjectEntity | nil,
  ): EntityUpdateResult {
    if (!pair) {
      // allow
      updateWorldEntities(entity, stage)
      return EntityUpdateResult.NoChange
    }
    if (pair.direction == targetDirection) {
      // pair is already correct direction
      updatePair(entity, entity.firstStage, pair, pair.firstStage)
      return EntityUpdateResult.NoChange
    }
    // this wasn't rotated, but pair was
    const rotateAllowed = stage == entity.firstStage || pair.firstStage == stage
    if (!rotateAllowed) {
      forceFlipUnderground(worldEntity) // back to broken state
      return EntityUpdateResult.CannotRotate
    }
    // rotate pair
    pair.direction = worldEntity.direction
    const oppositeType = worldEntity.belt_to_ground_type == "input" ? "output" : "input"
    pair.setTypeProperty(oppositeType)
    updatePair(entity, entity.firstStage, pair, pair.firstStage)
    return EntityUpdateResult.Updated
  }

  function doUndergroundBeltUpdate(
    entity: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    pair: UndergroundBeltProjectEntity | nil,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: string,
  ): EntityUpdateResult {
    const rotated = targetDirection && targetDirection != entity.direction

    const oldName = entity.getNameAtStage(stage)
    const upgraded = targetUpgrade != oldName

    if (!rotated && !upgraded) {
      if (!targetDirection) return EntityUpdateResult.NoChange
      return handleUndergroundFlippedBack(entity, worldEntity, stage, targetDirection, pair)
    }

    const isSelfOrPairFirstStage = stage == entity.firstStage || (pair && pair.firstStage == stage)

    if (rotated) {
      const rotateAllowed = isSelfOrPairFirstStage
      if (!rotateAllowed) {
        resetUnderground(entity, stage)
        return EntityUpdateResult.CannotRotate
      }

      entity.direction = targetDirection
      const oldType = entity.firstValue.type
      const newType = oldType == "input" ? "output" : "input"
      entity.setTypeProperty(newType)
      if (pair) {
        pair.direction = targetDirection
        pair.setTypeProperty(oldType)
      }
    }

    const applyStage = isSelfOrPairFirstStage ? entity.firstStage : stage
    const pairApplyStage = pair && isSelfOrPairFirstStage ? pair.firstStage : stage
    let cannotUpgradeChangedPair = false
    if (upgraded) {
      entity.applyUpgradeAtStage(applyStage, targetUpgrade)
      pair?.applyUpgradeAtStage(pairApplyStage, targetUpgrade)
      const newPair = findUndergroundPair(content, entity, stage)
      cannotUpgradeChangedPair = newPair != pair
      if (cannotUpgradeChangedPair) {
        entity.applyUpgradeAtStage(stage, oldName)
        pair?.applyUpgradeAtStage(pairApplyStage, oldName)
      }
    }

    if (cannotUpgradeChangedPair && !rotated) {
      refreshWorldEntityAtStage(entity, stage)
      if (pair) refreshWorldEntityAtStage(pair, stage)
    } else if (!pair) {
      updateWorldEntities(entity, applyStage)
    } else {
      updatePair(entity, applyStage, pair, pairApplyStage)
    }
    return cannotUpgradeChangedPair ? EntityUpdateResult.CannotUpgradeChangedPair : EntityUpdateResult.Updated
  }
  function handleUndergroundBeltUpdate(
    entity: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: string,
  ): EntityUpdateResult {
    const pair = findUndergroundPair(content, entity, stage)
    const updateResult = doUndergroundBeltUpdate(entity, worldEntity, pair, stage, targetDirection, targetUpgrade)

    const newWorldEntity = entity.getWorldEntity(stage)
    if (newWorldEntity) {
      const worldPair = newWorldEntity.neighbours as LuaEntity | nil
      if (worldPair && (!pair || pair.getWorldEntity(stage) != worldPair)) {
        // this pair is not the expected pair, so doUndergroundBeltUpdate didn't update it
        // this is an error state, just update highlights
        const worldPairEntity = content.findCompatibleWithLuaEntity(worldPair, nil, stage)
        if (worldPairEntity) updateAllHighlights(worldPairEntity)
      }
    }

    return updateResult
  }

  function maybeApplyEmptyControlBehavior(entity: ProjectEntity, stage: StageNumber): boolean {
    if (!maybeSetEmptyControlBehavior(entity, stage)) return false
    const luaEntity = entity.getWorldEntity(stage)
    if (luaEntity) applyValueFromWorld(stage, entity, luaEntity)
    return true
  }

  function updateWiresFromWorld(entity: ProjectEntity, stage: StageNumber): WireUpdateResult {
    const [connectionsChanged, maxConnectionsExceeded, additionalEntitiesToUpdate] = saveWireConnections(
      content,
      entity,
      stage,
      stage,
    )
    if (!connectionsChanged) return WireUpdateResult.NoChange

    const circuitConnections = content.getCircuitConnections(entity)
    // check setting no-op control behavior
    if (circuitConnections) maybeApplyEmptyControlBehavior(entity, stage)
    updateWorldEntities(entity, entity.firstStage)
    if (circuitConnections) {
      for (const [otherEntity] of circuitConnections) {
        if (maybeApplyEmptyControlBehavior(otherEntity, stage)) {
          updateWorldEntities(otherEntity, otherEntity.firstStage)
        }
      }
    }

    // update other entities as needed
    if (additionalEntitiesToUpdate) {
      for (const otherEntity of additionalEntitiesToUpdate) {
        updateWireConnections(otherEntity)
      }
    }

    if (maxConnectionsExceeded) {
      // this is last, so other updates happen even if max connections exceeded
      return WireUpdateResult.MaxConnectionsExceeded
    }
    return WireUpdateResult.Updated
  }

  function firstStageChangeWillIntersect(entity: ProjectEntity, newStage: StageNumber): boolean {
    // moving up is ok
    if (newStage >= entity.firstStage) return true

    // check moving down
    const foundBelow = content.findCompatibleWithExistingEntity(entity, newStage)
    return foundBelow == nil || foundBelow == entity
  }

  function lastStageChangeWillIntersect(entity: ProjectEntity, newStage: StageNumber | nil): boolean {
    const { lastStage } = entity
    // moving down is ok
    if (lastStage == nil || (newStage != nil && newStage < lastStage)) return true

    // check moving up
    const foundAbove = content.findCompatibleWithExistingEntity(entity, lastStage + 1)
    return foundAbove == nil || (newStage != nil && foundAbove.firstStage > newStage)
  }

  function checkCanSetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    if (entity.isSettingsRemnant || entity.firstStage == stage) return StageMoveResult.NoChange
    if (entity.lastStage && stage > entity.lastStage) return StageMoveResult.CannotMovePastLastStage

    if (!firstStageChangeWillIntersect(entity, stage)) {
      return StageMoveResult.IntersectsAnotherEntity
    }
    return StageMoveResult.Updated
  }

  function trySetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    const result = checkCanSetFirstStage(entity, stage)
    if (result == StageMoveResult.Updated) {
      const stageToUpdate = min(entity.firstStage, stage)
      entity.setFirstStageUnchecked(stage)
      updateWorldEntities(entity, stageToUpdate)
    }
    return result
  }

  function checkSetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
    if (entity.isSettingsRemnant) return StageMoveResult.NoChange
    const oldLastStage = entity.lastStage
    if (oldLastStage == stage) return StageMoveResult.NoChange
    // check firstStage <= lastStage
    if (stage != nil && stage < entity.firstStage) return StageMoveResult.CannotMoveBeforeFirstStage

    if (!lastStageChangeWillIntersect(entity, stage)) {
      return StageMoveResult.IntersectsAnotherEntity
    }

    return StageMoveResult.Updated
  }

  function trySetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
    if (entity.isSettingsRemnant) return StageMoveResult.NoChange
    const result = checkSetLastStage(entity, stage)
    if (result == StageMoveResult.Updated) {
      const oldLastStage = entity.lastStage
      entity.setLastStageUnchecked(stage)
      updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
    }
    return result
  }

  function resetProp<T extends Entity>(entity: ProjectEntity<T>, stageNumber: StageNumber, prop: keyof T): boolean {
    const moved = entity.resetProp(stageNumber, prop)
    if (moved) updateWorldEntities(entity, stageNumber)
    return moved
  }

  function movePropDown<T extends Entity>(entity: ProjectEntity<T>, stageNumber: StageNumber, prop: keyof T): boolean {
    const movedStage = entity.movePropDown(stageNumber, prop)
    if (movedStage) {
      updateWorldEntities(entity, movedStage)
      return true
    }
    return false
  }

  function resetAllProps(entity: ProjectEntity, stageNumber: StageNumber): boolean {
    const moved = entity.resetValue(stageNumber)
    if (moved) updateWorldEntities(entity, stageNumber)
    return moved
  }

  function moveAllPropsDown(entity: ProjectEntity, stageNumber: StageNumber): boolean {
    const movedStage = entity.moveValueDown(stageNumber)
    if (movedStage) {
      updateWorldEntities(entity, movedStage)
      return true
    }
    return false
  }

  function resetTrain(entity: RollingStockProjectEntity): void {
    const stage = entity.firstStage
    const luaEntity = entity.getWorldEntity(stage)
    if (!luaEntity) {
      refreshWorldEntityAtStage(entity, stage)
      return
    }

    const train = luaEntity.train
    if (!train) return

    const entities = train.carriages

    const projectEntities = entities.map((e) => content.findCompatibleWithLuaEntity(e, nil, stage)!)
    for (const entity of projectEntities) entity.destroyAllWorldOrPreviewEntities()
    for (const entity of projectEntities) rebuildWorldEntityAtStage(entity, stage)
  }

  function setTrainLocationToCurrent(entity: RollingStockProjectEntity): void {
    const stage = entity.firstStage
    const luaEntity = entity.getWorldEntity(stage)
    if (!luaEntity) return

    const train = luaEntity.train
    if (!train) return

    const entities = train.carriages

    for (const luaEntity of entities) {
      const projectEntity = content.findCompatibleWithLuaEntity(luaEntity, nil, stage)
      if (projectEntity) {
        content.changePosition(projectEntity, luaEntity.position)
        rebuildWorldEntityAtStage(projectEntity, stage)
      } else {
        // add
        addNewEntity(luaEntity, stage)
      }
    }
  }
}
