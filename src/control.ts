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

/** @beforeImports */
{
  pcall(require, "test.module-mock")
  // require("__debugadapter__/debugadapter.lua")
}

import { Events } from "./lib"
import { formatVersion, Migrations } from "./lib/migration"
import "./project"
import "./ui"

pcall(require, "test.test-init")

Events.on_init(() => {
  const force = game.forces.player
  force.research_all_technologies()
  force.enable_all_recipes()
})

// note this handler runs last, so other files can do other migrations first
Events.on_configuration_changed((data) => {
  const thisChange = data.mod_changes[script.mod_name]
  if (!thisChange) return
  const oldVersion = thisChange.old_version
  if (!oldVersion) return
  if (formatVersion(oldVersion) < formatVersion("0.13.1")) {
    error(
      "Staged blueprint planning: migrating from a version earlier than 0.13.1 is no longer supported after v0.16.0 " +
        "Try installing version 0.15.x first (by downloading directly from the mod portal), loading/saving the game, THEN install the latest version.",
    )
  }
  Migrations.doMigrations(oldVersion)
})
