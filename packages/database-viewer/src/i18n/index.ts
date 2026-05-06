import enMessages from "./en.json";
import jaMessages from "./ja.json";

export type DatabaseViewerMessages = typeof jaMessages;

const _enAssertion: DatabaseViewerMessages = enMessages;
void _enAssertion;

export {
  enMessages as databaseViewerEnMessages,
  jaMessages as databaseViewerJaMessages,
};
