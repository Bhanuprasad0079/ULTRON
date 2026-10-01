import { AnimatePresence, motion } from "framer-motion";

interface PendingConfirm {
  confirm_id: string;
  tool: string;
  args: Record<string, unknown>;
}

interface Props {
  pending: PendingConfirm | null;
  onRespond: (approved: boolean) => void;
}

export default function ConfirmationModal({ pending, onRespond }: Props) {
  return (
    <AnimatePresence>
      {pending ? (
        <motion.div className="confirm-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="confirm-modal" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
            <div className="confirm-title">AUTHORIZATION REQUIRED</div>
            <div className="confirm-tool">{pending.tool.replace(/_/g, " ").toUpperCase()}</div>
            <pre className="confirm-args">{JSON.stringify(pending.args, null, 2)}</pre>
            <div className="confirm-hint">Speak "proceed" or "cancel" — or choose below.</div>
            <div className="confirm-buttons">
              <button className="confirm-approve" onClick={() => onRespond(true)}>PROCEED</button>
              <button className="confirm-deny" onClick={() => onRespond(false)}>HALT</button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}