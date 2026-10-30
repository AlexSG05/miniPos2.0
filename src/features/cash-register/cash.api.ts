import { invokeAuthed } from "../../lib/invokeAuthed";

export type CashSession = {
  id: number;
  openedAt: string;
  openingCents: number;
  expectedCents: number;
  cashSalesCents: number;
  cashRefundsCents: number;
  cardSalesCents: number;
  cashInCents: number;
  cashOutCents: number;
};

export type CashClosure = {
  id: number;
  openedAt: string;
  closedAt: string;
  openingCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
};

export function getOpenCashSession() {
  return invokeAuthed<CashSession | null>("get_open_cash_session");
}

export function listCashClosures() {
  return invokeAuthed<CashClosure[]>("list_cash_closures");
}

export function openCashSession(openingCents: number) {
  return invokeAuthed<CashSession>("open_cash_session", { openingCents });
}

export function closeCashSession(countedCents: number) {
  return invokeAuthed<number>("close_cash_session", { countedCents });
}

export function recordCashMovement(movement: { direction: "in" | "out"; amountCents: number; reason: string }) {
  return invokeAuthed<void>("record_cash_movement", { movement });
}
