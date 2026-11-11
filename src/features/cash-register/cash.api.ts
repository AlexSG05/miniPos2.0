import { invokeAuthed } from "../../lib/invokeAuthed";

export type CashSession = {
  id: number;
  openedAt: string;
  openedByName: string;
  openingCents: number;
  openingNote: string | null;
  expectedCents: number;
  cashSalesCents: number;
  cashRefundsCents: number;
  cardSalesCents: number;
  cashInCents: number;
  cashOutCents: number;
};

export type CashClosure = {
  id: number;
  openedByName: string;
  closedByName: string;
  openedAt: string;
  closedAt: string;
  openingCents: number;
  cashSalesCents: number;
  cashRefundsCents: number;
  cardSalesCents: number;
  cashInCents: number;
  cashOutCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  differenceReason: string | null;
  denominations: CashDenomination[];
  withdrawals: { movementId: number; amountCents: number; reason: string; createdAt: string; createdByName: string; recipientName: string; denominations: CashDenomination[] }[];
};

export type CashDenomination = { denominationCents: number; quantity: number; subtotalCents: number };

export function getOpenCashSession() {
  return invokeAuthed<CashSession | null>("get_open_cash_session");
}

export function listCashClosures() {
  return invokeAuthed<CashClosure[]>("list_cash_closures");
}

export function openCashSession(openingCents: number, openingNote = "") {
  return invokeAuthed<CashSession>("open_cash_session", { openingCents, openingNote });
}

export function closeCashSession(closure: { denominations: CashDenomination[]; differenceReason: string }) {
  return invokeAuthed<CashClosure>("close_cash_session", { closure });
}

export function recordCashMovement(movement: { direction: "in" | "out"; amountCents: number; reason: string }) {
  return invokeAuthed<void>("record_cash_movement", { movement });
}

export function recordCashWithdrawal(withdrawal: { denominations: CashDenomination[]; recipientUserId: number; reason: string }) {
  return invokeAuthed<number>("record_cash_withdrawal", { withdrawal });
}
