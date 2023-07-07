import { useEffect } from "react";

export default function Room() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      console.log(window.location.search);
      console.log(urlParams.get("roomId"));
      console.log(urlParams.get("name"));
      console.log(urlParams.get("color"));
    }
  }, []);
  return <>Room Shambles</>;
}
