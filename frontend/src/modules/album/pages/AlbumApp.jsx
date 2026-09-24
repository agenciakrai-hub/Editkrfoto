import React from "react";
import { useSearchParams } from "react-router-dom";
import AlbumsPage from "@/modules/album/pages/AlbumsPage";
import AlbumEditorPage from "@/modules/album/pages/AlbumEditorPage";

// Switcher del módulo Álbum AI (patrón ?project=). El editor vive en una sola ruta.
export default function AlbumApp() {
  const [params] = useSearchParams();
  const projectId = params.get("project");
  return projectId ? <AlbumEditorPage projectId={projectId} /> : <AlbumsPage />;
}
