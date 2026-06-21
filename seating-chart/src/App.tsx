import { Routes, Route, Navigate } from "react-router-dom";
import ClassesIndex from "@/routes/ClassesIndex";
import Roster from "@/routes/Roster";
import RoomDesigner from "@/routes/RoomDesigner";
import History from "@/routes/History";
import AppShell from "@/components/AppShell";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ClassesIndex />} />
        <Route path="rooms/:id" element={<RoomDesigner mode="layout" />} />
        <Route path="classes/:id/roster" element={<Roster />} />
        <Route path="classes/:id/room" element={<RoomDesigner mode="seating" />} />
        <Route path="classes/:id/history" element={<History />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
