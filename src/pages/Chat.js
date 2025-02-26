import React from "react";
import { useParams } from "react-router-dom";
import ChatWindow from "../components/ChatWindow";

const Chat = ({ onClose }) => {
  const { friendId } = useParams();
  return <ChatWindow friendId={friendId} onClose={onClose} />;
};

export default Chat;