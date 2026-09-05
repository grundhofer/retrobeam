// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createContext, useContext } from "react";
import type { ClientCommand, ServerEvent } from "@retropolis/shared";

export interface BoardConnection {
  /** The board this connection belongs to — board-scoped REST routes (the GIF
   *  proxy) need it, and the capability lives in the URL either way. */
  boardId: string;
  send: (command: ClientCommand) => void;
  /** Send a mutating command and optimistically apply its expected outcome(s)
   *  through the shared reducer (seq 0 = local echo).
   *
   *  `onReject` runs if the server refuses it. The optimistic echo is undone by
   *  the resync that follows either way; this is for whatever the UI threw away
   *  in the meantime — a composer that cleared itself has to give the text
   *  back, or a refused note is simply lost work with no way to retype it. */
  mutate: (
    command: ClientCommand,
    optimistic: ServerEvent | ServerEvent[],
    onReject?: () => void,
  ) => void;
}

const ConnectionContext = createContext<BoardConnection | null>(null);

export const ConnectionProvider = ConnectionContext.Provider;

export function useConnection(): BoardConnection {
  const connection = useContext(ConnectionContext);
  if (connection === null)
    throw new Error("useConnection outside of a board room");
  return connection;
}
