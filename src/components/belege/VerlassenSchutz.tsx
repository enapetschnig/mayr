import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Rückfrage beim Verlassen mit ungespeicherten Änderungen (siehe useVerlassenSchutz) */
export function VerlassenDialog({
  offen, onAbbrechen, onVerwerfen, onSpeichern, speichertGerade,
}: {
  offen: boolean;
  onAbbrechen: () => void;
  onVerwerfen: () => void;
  onSpeichern: () => void;
  speichertGerade: boolean;
}) {
  return (
    <AlertDialog open={offen} onOpenChange={(o) => { if (!o) onAbbrechen(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Änderungen speichern?</AlertDialogTitle>
          <AlertDialogDescription>Es gibt ungespeicherte Änderungen. Ohne Speichern gehen sie verloren.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onAbbrechen}>Weiter bearbeiten</Button>
          <Button variant="outline" className="h-11 border-destructive/40 text-destructive hover:text-destructive" onClick={onVerwerfen}>Verwerfen</Button>
          <Button className="h-11" onClick={onSpeichern} disabled={speichertGerade}>{speichertGerade ? "Speichert …" : "Speichern"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
