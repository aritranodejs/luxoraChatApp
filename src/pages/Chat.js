import React from "react";
import { useParams } from "react-router-dom";
import ChatWindow from "../components/ChatWindow";

const Chat = ({ onClose }) => {
  const { friendSlug } = useParams();
  return <ChatWindow friendSlug={friendSlug} onClose={onClose} />;
};

export default Chat;