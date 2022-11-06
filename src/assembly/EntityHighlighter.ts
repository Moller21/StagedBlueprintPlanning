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

import { AssemblyEntity, entityHasErrorAt, ExtraEntities, StageNumber } from "../entity/AssemblyEntity"
import { getSelectionBox } from "../entity/entity-info"
import { assertNever } from "../lib"
import { Position } from "../lib/geometry"
import draw, { AnyRender, DrawParams, SpriteRender } from "../lib/rendering"
import { Assembly } from "./AssemblyDef"

export type HighlightEntity = HighlightBoxEntity | SpriteRender
export interface HighlightEntities {
  /** Error outline when an entity cannot be placed. Should be placed on preview entity. */
  errorOutline?: HighlightBoxEntity
  /** Indicator sprite when there is an error highlight in another stage. */
  errorElsewhereIndicator?: SpriteRender

  /** Blue outline when a settings remnant entity is left behind. */
  settingsRemnantHighlight?: HighlightBoxEntity

  /** Blue outline when an entity's settings have changed. */
  configChangedHighlight?: HighlightBoxEntity
  /** Blueprint sprite when an entity's settings have changed in a future stage. */
  configChangedLaterHighlight?: SpriteRender
}
declare module "../entity/AssemblyEntity" {
  // noinspection JSUnusedGlobalSymbols
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface ExtraEntities extends HighlightEntities {}
}

/**
 * Handles various highlights (preview, icons, highlight-boxes) for world entities.
 *
 * @noSelf
 */
export interface EntityHighlighter {
  /** Updates config changed, and error highlights. */
  updateHighlights(assembly: Assembly, entity: AssemblyEntity): void
  updateHighlights(assembly: Assembly, entity: AssemblyEntity, stageStart: StageNumber, stageEnd: StageNumber): void

  deleteHighlights(entity: AssemblyEntity): void
  deleteHighlightsInStage(entity: AssemblyEntity, stage: StageNumber): void

  makeSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void
  reviveSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void
}

/** @noSelf */
export interface HighlightCreator {
  createHighlightBox(target: LuaEntity | nil, type: CursorBoxRenderType): LuaEntity | nil

  createSprite(params: DrawParams["sprite"]): SpriteRender
}

interface HighlightConfig {
  readonly type: "highlight"
  readonly renderType: CursorBoxRenderType
}

interface SpriteConfig {
  readonly type: "sprite"
  readonly sprite: SpritePath
  readonly offset: Position
  readonly tint?: Color | ColorArray
  readonly scale: number
  readonly scaleRelative?: boolean
  readonly renderLayer: RenderLayer
}

export const enum HighlightValues {
  Error = "not-allowed",
  SettingsRemnant = "train-visualization",
  ConfigChanged = "logistics",
  Upgraded = "copy",
  ErrorInOtherStage = "utility/danger_icon",
  ConfigChangedLater = "item/blueprint",
  UpgradedLater = "item/upgrade-planner",
}
const highlightConfigs: {
  [P in keyof HighlightEntities]-?: HighlightConfig | SpriteConfig
} = {
  errorOutline: {
    type: "highlight",
    renderType: HighlightValues.Error,
  },
  errorElsewhereIndicator: {
    type: "sprite",
    sprite: HighlightValues.ErrorInOtherStage,
    offset: { x: 0.2, y: 0.1 },
    scale: 0.3,
    renderLayer: "entity-info-icon-above",
  },
  settingsRemnantHighlight: {
    type: "highlight",
    renderType: HighlightValues.SettingsRemnant,
  },
  configChangedHighlight: {
    type: "highlight",
    renderType: HighlightValues.ConfigChanged,
  },
  configChangedLaterHighlight: {
    type: "sprite",
    sprite: HighlightValues.ConfigChangedLater,
    offset: { x: 0.8, y: 0.1 },
    scale: 0.5,
    renderLayer: "entity-info-icon-above",
  },
}

export function createHighlightCreator(entityCreator: HighlightCreator): EntityHighlighter {
  const { createHighlightBox, createSprite } = entityCreator

  function createHighlight<T extends keyof HighlightEntities>(
    entity: AssemblyEntity,
    stage: StageNumber,
    surface: LuaSurface,
    type: T,
  ): HighlightEntities[T] {
    const config = highlightConfigs[type]
    const existing = entity.getExtraEntity(type, stage)
    if (existing && config.type == "sprite") return existing
    // always replace highlight box, in case of upgrade

    const prototypeName = entity.firstValue.name
    const selectionBox = getSelectionBox(prototypeName).rotateAboutOrigin(entity.direction)
    let result: LuaEntity | AnyRender | nil
    if (config.type == "highlight") {
      const { renderType } = config
      const entityTarget = entity.getWorldOrPreviewEntity(stage)
      result = entityTarget && createHighlightBox(entityTarget, renderType)
    } else if (config.type == "sprite") {
      const size = selectionBox.size()
      const relativePosition = size.emul(config.offset).plus(selectionBox.left_top)
      const worldPosition = relativePosition.plus(entity.position)
      const scale = config.scaleRelative ? (config.scale * (size.x + size.y)) / 2 : config.scale
      result = createSprite({
        surface,
        target: worldPosition,
        x_scale: scale,
        y_scale: scale,
        sprite: config.sprite,
        tint: config.tint,
        render_layer: config.renderLayer,
      })
    } else {
      assertNever(config)
    }

    entity.replaceExtraEntity(type, stage, result as ExtraEntities[T])
    return result as HighlightEntities[T]
  }
  function removeHighlight(entity: AssemblyEntity, stageNumber: StageNumber, type: keyof HighlightEntities): void {
    entity.destroyExtraEntity(type, stageNumber)
  }
  function removeHighlightFromAllStages(entity: AssemblyEntity, type: keyof HighlightEntities): void {
    entity.destroyAllExtraEntities(type)
  }
  function updateHighlight(
    entity: AssemblyEntity,
    stage: StageNumber,
    surface: LuaSurface,
    type: keyof HighlightEntities,
    value: boolean | nil,
  ): HighlightEntity | nil {
    if (value) return createHighlight(entity, stage, surface, type)
    removeHighlight(entity, stage, type)
    return nil
  }

  function updateAssociatedEntitiesAndErrorHighlight(assembly: Assembly, entity: AssemblyEntity): void {
    for (const stage of $range(
      entity.firstStage,
      entity.inFirstStageOnly() ? entity.firstStage : assembly.maxStage(),
    )) {
      const hasError = entityHasErrorAt(entity, stage)
      updateHighlight(entity, stage, assembly.getSurface(stage)!, "errorOutline", hasError)
    }
  }

  function updateErrorIndicators(assembly: Assembly, entity: AssemblyEntity): void {
    if (entity.isRollingStock()) return
    let hasErrorAnywhere = false
    for (const i of $range(entity.firstStage, assembly.maxStage())) {
      const hasError = entity.getWorldEntity(i) == nil
      if (hasError) {
        hasErrorAnywhere = true
        break
      }
    }
    if (!hasErrorAnywhere) {
      entity.destroyAllExtraEntities("errorElsewhereIndicator")
      return
    }

    for (const stage of $range(1, assembly.maxStage())) {
      const shouldHaveIndicator = stage >= entity.firstStage && entity.getWorldEntity(stage) != nil
      updateHighlight(entity, stage, assembly.getSurface(stage)!, "errorElsewhereIndicator", shouldHaveIndicator)
    }
  }

  function updateAllConfigChangedHighlights(assembly: Assembly, entity: AssemblyEntity): void {
    const firstStage = entity.firstStage
    let lastStageWithHighlights = firstStage
    for (const stage of $range(1, assembly.maxStage())) {
      const hasConfigChanged = entity.hasStageDiff(stage)
      const isUpgrade = hasConfigChanged && entity.getStageDiff(stage)!.name != nil
      const highlight = updateHighlight(
        entity,
        stage,
        assembly.getSurface(stage)!,
        "configChangedHighlight",
        hasConfigChanged,
      )
      if (highlight) {
        ;(highlight as HighlightBoxEntity).highlight_box_type = isUpgrade
          ? HighlightValues.Upgraded
          : HighlightValues.ConfigChanged
      }
      if (!hasConfigChanged) continue

      // update configChangedLaterHighlights in previous stages
      const sprite = isUpgrade ? HighlightValues.UpgradedLater : HighlightValues.ConfigChangedLater
      for (; lastStageWithHighlights < stage; lastStageWithHighlights++) {
        const highlight = updateHighlight(
          entity,
          lastStageWithHighlights,
          assembly.getSurface(lastStageWithHighlights)!,
          "configChangedLaterHighlight",
          true,
        ) as SpriteRender
        highlight.sprite = sprite
      }
    }
    if (lastStageWithHighlights == firstStage) {
      // remove later highlights for all stages
      removeHighlightFromAllStages(entity, "configChangedLaterHighlight")
    } else {
      for (const i of $range(lastStageWithHighlights, assembly.maxStage())) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
      for (const i of $range(1, firstStage - 1)) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
    }
  }
  function updateHighlights(assembly: Assembly, entity: AssemblyEntity): void {
    // ignore start and end stage for now
    updateAssociatedEntitiesAndErrorHighlight(assembly, entity)
    if (!entity.isRollingStock()) {
      updateErrorIndicators(assembly, entity)
      updateAllConfigChangedHighlights(assembly, entity)
    }
  }

  return {
    updateHighlights,
    deleteHighlights(entity: AssemblyEntity): void {
      for (const type of keys<HighlightEntities>()) entity.destroyAllExtraEntities(type)
    },
    deleteHighlightsInStage(entity: AssemblyEntity, stage: StageNumber) {
      for (const type of keys<HighlightEntities>()) entity.destroyExtraEntity(type, stage)
    },
    makeSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
      if (!entity.isSettingsRemnant) return
      for (const type of keys<HighlightEntities>()) entity.destroyAllExtraEntities(type)
      for (const stage of $range(1, assembly.maxStage())) {
        updateHighlight(entity, stage, assembly.getSurface(stage)!, "settingsRemnantHighlight", true)
      }
    },
    reviveSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
      if (entity.isSettingsRemnant) return
      entity.destroyAllExtraEntities("settingsRemnantHighlight")
      updateHighlights(assembly, entity)
    },
  }
}

export const HighlightCreator: HighlightCreator = {
  createHighlightBox(target: LuaEntity | nil, type: CursorBoxRenderType): LuaEntity | nil {
    if (!target) return nil
    return target.surface.create_entity({
      name: "highlight-box",
      position: target.position,
      source: target,
      box_type: type,
      force: target.force,
    })
  },
  createSprite(params: DrawParams["sprite"]): SpriteRender {
    return draw("sprite", params)
  },
}

export const EntityHighlighter = createHighlightCreator(HighlightCreator)
