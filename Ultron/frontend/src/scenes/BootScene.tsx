import { motion } from "framer-motion";

interface BootSceneProps {
  onInitiate: () => void;
}

export default function BootScene({ onInitiate }: BootSceneProps) {
  return (
    <motion.div
      className="scene boot"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      onClick={onInitiate}
      style={{ cursor: "pointer" }}
    >
      <div className="boot-content">
        <motion.div
          className="boot-title"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          ULTRON
        </motion.div>
        <div className="boot-subtitle">SYSTEM BOOT</div>
        <motion.div
          className="boot-initiate"
          animate={{ opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          [ CLICK ANYWHERE TO INITIATE ]
        </motion.div>
      </div>
    </motion.div>
  );
}