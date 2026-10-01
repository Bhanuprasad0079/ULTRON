import { motion } from "framer-motion";

import MediaBackground from "../components/MediaBackground";

interface IntroSceneProps {
  onIntroFinished: () => void;
}

export default function IntroScene({ onIntroFinished }: IntroSceneProps) {
  const startupSrc = `${import.meta.env.BASE_URL}assets/video/startup.mp4`;

  return (
    <motion.div
      className="scene intro"
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      exit={{
        opacity: 0,
      }}
      transition={{
        duration: 0.45,
      }}
    >
      <MediaBackground
        src={startupSrc}
        mode="oneshot"
        muted={false}
        volume={1}
        onEnded={onIntroFinished}
        fallbackLabel="INITIALIZING ULTRON"
      />

      <div className="overlay" />

      <motion.div
        className="intro-text"
        initial={{
          opacity: 0,
          y: 12,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        transition={{
          delay: 0.35,
          duration: 0.75,
        }}
      >
        <div className="intro-title">ULTRON AWAKEN</div>
        <div className="intro-subtitle">AI CORE ONLINE</div>
      </motion.div>
    </motion.div>
  );
}