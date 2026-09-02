import React, { useState } from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import { Input } from "../ui/input";

interface ArrivalModalProps {
  dateOpen: boolean;
  setDateOpen: (open: boolean) => void;
  selectedDate: string;  
  itineraryId?: string | undefined;
}

const ArrivalDate = ({ dateOpen, setDateOpen, selectedDate,itineraryId }: ArrivalModalProps) => {
  const [plan, setPlan] = useState("");

  const submitPlan = async () => {
     try {
    await fetch("/api/pdf/arrival", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        itineraryId:  itineraryId,
        date: selectedDate, 
        plan: plan
      })
    });

    setDateOpen(false);
  } catch (error) {
    console.error("Error updating:", error);  // eslint-disable-line no-console
  }
  };

  return (
    <Dialog open={dateOpen} onOpenChange={setDateOpen}>
      <DialogContent className="sm:max-w-2xl w-md px-4 sm:px-8 lg:px-8 rounded-2xl min-h-[40vh]">
        <div className="space-y-5">
          
          <h2 className="text-xl font-semibold">Write plan for {selectedDate}</h2>

          <Input
            placeholder="Enter your plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          />

          <button
            onClick={submitPlan}
            className="w-full mt-6 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArrivalDate;
