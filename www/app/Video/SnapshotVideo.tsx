"use client";
import { useRef, useEffect } from "react";
import useIntersection from "@/common/useIntersection";

// looking to add width or height? add a poster with the size you want instead.
export default function SnapshotVideo(props: { src: string; poster: string }) {
  const { src, poster } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVisible = useIntersection(videoRef, {
    rootMargin: "-200px",
  });

  useEffect(() => {
    if (videoRef && videoRef.current && isVisible) {
      videoRef.current.play();
    }
  }, [videoRef, isVisible]);

  return (
    <video muted ref={videoRef} loop poster={`/video/${poster}`}>
      <source src={`/video/${src}`} />
    </video>
  );
}
