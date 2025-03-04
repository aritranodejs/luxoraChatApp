import React, { useState } from "react";
import FriendsList from "../components/FriendsList";

const Friends = ({ onSelectChat }) => {
  const [search, setSearch] = useState("");

  return (
    <div>
      <input
        type="text"
        className="form-control mb-3"
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <FriendsList searchQuery={search} onSelectChat={onSelectChat} />
    </div>
  );
};

export default Friends;