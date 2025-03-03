import React, { useState, useEffect } from "react";
import FriendsList from "../components/FriendsList";
import { globalUsers, friends } from "../services/friendService";

const Friends = ({ onSelectChat }) => {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [friendsList, setFriendsList] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        let globalUsersData = await globalUsers();    
        globalUsersData = globalUsersData?.data;
        
        let friendsData = await friends();
        friendsData = friendsData?.data?.friends;

        // Mark users as friends
        const updatedUsers = globalUsersData.map((user) => ({
          ...user,
          isFriend: friendsData.some((friend) => friend.id === user.id),
        }));

        setUsers([...updatedUsers]);
        setFriendsList(friendsData);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div>
      <input
        type="text"
        className="form-control mb-3"
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <FriendsList searchQuery={search} friends={friendsList} users={users} onSelectChat={onSelectChat} />
    </div>
  );
};

export default Friends;