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

import { FrameGuiElement, FrameGuiElementMembers, LocalisedString, LuaPlayer, PlayerIndex } from "factorio:runtime"
import { CustomInputs } from "../../../constants"
import { Events } from "../../Events"
import { Func, ibind, RegisterClass } from "../../references"
import { Component, Element } from "../element"
import { destroy, FactorioJsx, getComponentInstance, GuiEvent, renderOpened } from "../index"

export interface DialogProps {
  title: LocalisedString
  message: LocalisedString[]

  backCaption?: LocalisedString
  onBack?: Func<(player: LuaPlayer) => void>

  confirmCaption?: LocalisedString
  onConfirm?: Func<(player: LuaPlayer) => void>

  redConfirm?: boolean
}
@RegisterClass("gui:Dialog")
export class Dialog extends Component<DialogProps> {
  private element!: FrameGuiElementMembers
  private onBackFn?: Func<(player: LuaPlayer) => void>
  private onConfirmFn?: Func<(player: LuaPlayer) => void>
  private redConfirm?: boolean
  public override render(props: DialogProps): Element {
    assert(props.backCaption || props.confirmCaption, "Dialog requires at least one button")

    this.onBackFn = props.onBack
    this.onConfirmFn = props.onConfirm
    this.redConfirm = props.redConfirm

    return (
      <frame
        auto_center
        caption={props.title}
        direction={"vertical"}
        onCreate={(e) => (this.element = e)}
        on_gui_closed={ibind(this.onBack)}
      >
        {props.message.map((line) => (
          <label caption={line} />
        ))}
        <flow style="dialog_buttons_horizontal_flow">
          {props.backCaption != nil && (
            <button style="back_button" caption={props.backCaption} on_gui_click={ibind(this.onBack)} />
          )}
          <empty-widget
            style="draggable_space"
            styleMod={{ horizontally_stretchable: true }}
            onCreate={(e) => (e.drag_target = e.parent!.parent as FrameGuiElement)}
          />
          {props.confirmCaption != nil && (
            <button
              style={props.redConfirm ? "red_confirm_button" : "confirm_button"}
              caption={props.confirmCaption}
              on_gui_click={ibind(this.onConfirm)}
            />
          )}
        </flow>
      </frame>
    )
  }

  private onBack(e: GuiEvent) {
    this.onBackFn?.invoke(game.players[e.player_index])
    destroy(this.element)
  }

  public onConfirm(e: { player_index: PlayerIndex }): void {
    this.onConfirmFn?.invoke(game.players[e.player_index])
    destroy(this.element)
  }
}

Events.on(CustomInputs.ConfirmGui, (e) => {
  const player = game.players[e.player_index]
  const opened = player.opened
  if (opened?.object_name != "LuaGuiElement" || opened.type != "frame") return
  const instance = getComponentInstance(opened)
  if (instance && instance instanceof Dialog) {
    instance.onConfirm(e)
    player.play_sound({ path: "utility/confirm" })
  }
})

export function showDialog(player: LuaPlayer, props: DialogProps): void {
  renderOpened(player, { type: Dialog, props })
}
