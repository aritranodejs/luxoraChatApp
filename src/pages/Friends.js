import React, { useState } from "react";
import FriendsList from "../components/FriendsList";

const Friends = ({ onSelectChat }) => {
  const [search, setSearch] = useState("");
  const friends = [
    { id: "AI-Copilot", name: "LuxaCopilot", isOnline: true, isFriend: true, isAI: true },
    { id: 1, name: "Alice", isOnline: true, isFriend: true },
    { id: 2, name: "Bob", isOnline: false, isFriend: true },
  ];

  return (
    <div>
      <input 
        type="text" 
        className="form-control mb-3" 
        placeholder="Search users..." 
        value={search} 
        onChange={(e) => setSearch(e.target.value)}
      />
      <FriendsList searchQuery={search} friends={friends} onSelectChat={onSelectChat} />
    </div>
  );
};

export default Friends;